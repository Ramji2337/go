package controllers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetAssignedPapersReviewer(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{"assignedReviewers": reviewerObjId}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching papers"})
	}
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func GetPaperForReview(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "assignedReviewers": reviewerObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found or not assigned to you"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "paper": paper})
}

func SubmitReview(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	var input struct {
		Comments          string `json:"comments"`
		CommentsToReviewer string `json:"commentsToReviewer"`
		CommentsToEditor  string `json:"commentsToEditor"`
		Strengths         string `json:"strengths"`
		Weaknesses        string `json:"weaknesses"`
		OverallRating     int    `json:"overallRating"`
		NoveltyRating     int    `json:"noveltyRating"`
		QualityRating     int    `json:"qualityRating"`
		ClarityRating     int    `json:"clarityRating"`
		Recommendation    string `json:"recommendation"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := papersCol.FindOne(ctx, bson.M{"submissionId": submissionId, "assignedReviewers": reviewerObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found or not assigned to you"})
	}

	paperId, _ := paper["_id"].(primitive.ObjectID)

	now := time.Now()
	reviewDoc := bson.M{
		"paper":              paperId,
		"submissionId":       submissionId,
		"reviewer":           reviewerObjId,
		"reviewerName":       claims.Username,
		"reviewerEmail":      claims.Email,
		"comments":           input.Comments,
		"commentsToReviewer": input.CommentsToReviewer,
		"commentsToEditor":   input.CommentsToEditor,
		"strengths":          input.Strengths,
		"weaknesses":         input.Weaknesses,
		"overallRating":      input.OverallRating,
		"noveltyRating":      input.NoveltyRating,
		"qualityRating":      input.QualityRating,
		"clarityRating":      input.ClarityRating,
		"recommendation":     input.Recommendation,
		"status":             "submitted",
		"round":              1,
		"submittedAt":        now,
		"createdAt":          now,
		"updatedAt":          now,
	}

	reviewsCol := config.GetCollection("reviewerreviews")
	reviewsCol.InsertOne(ctx, reviewDoc)

	// Update paper assignment status
	papersCol.UpdateOne(ctx, bson.M{"_id": paperId, "reviewAssignments.reviewer": reviewerObjId}, bson.M{
		"$set": bson.M{
			"reviewAssignments.$.status": "Completed",
			"reviewAssignments.$.respondedAt": now,
			"status":    "Review Received",
			"updatedAt": now,
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Review submitted successfully"})
}

func GetReviewDraft(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerreviews")
	opts := options.FindOne().SetSort(bson.M{"createdAt": -1})
	var review bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId, "reviewer": reviewerObjId}, opts).Decode(&review)

	return c.Status(200).JSON(fiber.Map{"success": true, "review": review})
}

func GetReviewerDashboardStats(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	reviewsCol := config.GetCollection("reviewerreviews")

	totalAssigned, _ := papersCol.CountDocuments(ctx, bson.M{"assignedReviewers": reviewerObjId})
	completed, _ := reviewsCol.CountDocuments(ctx, bson.M{"reviewer": reviewerObjId, "status": "submitted"})
	pending := totalAssigned - completed

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"stats": fiber.Map{
			"totalAssigned": totalAssigned,
			"completed":     completed,
			"pending":       pending,
		},
	})
}

func AcceptReviewerAssignment(c *fiber.Ctx) error {
	var input struct {
		Token string `json:"token"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	result, err := col.UpdateOne(ctx, bson.M{
		"acceptanceToken":        input.Token,
		"acceptanceTokenExpires": bson.M{"$gt": time.Now()},
	}, bson.M{
		"$set": bson.M{
			"status":     "Accepted",
			"acceptedAt": time.Now(),
		},
		"$unset": bson.M{"acceptanceToken": "", "acceptanceTokenExpires": ""},
	})
	if err != nil || result.MatchedCount == 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid or expired token"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Assignment accepted"})
}

func RejectReviewerAssignment(c *fiber.Ctx) error {
	var input struct {
		Token  string `json:"token"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	col.UpdateOne(ctx, bson.M{"acceptanceToken": input.Token}, bson.M{
		"$set": bson.M{
			"status":          "Rejected",
			"rejectionReason": input.Reason,
			"rejectedAt":      time.Now(),
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Assignment declined"})
}

func GetRejectionForm(c *fiber.Ctx) error {
	token := c.Query("token")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	var assignment bson.M
	if err := col.FindOne(ctx, bson.M{"acceptanceToken": token}).Decode(&assignment); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Assignment not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "assignment": assignment})
}

func GetAssignmentDetails(c *fiber.Ctx) error {
	assignmentId := c.Params("assignmentId")
	assignmentObjId, err := primitive.ObjectIDFromHex(assignmentId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid assignment ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	var assignment bson.M
	if err := col.FindOne(ctx, bson.M{"_id": assignmentObjId}).Decode(&assignment); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Assignment not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "assignment": assignment})
}

func AcceptAssignment(c *fiber.Ctx) error {
	var input struct {
		AssignmentId string `json:"assignmentId"`
		Token        string `json:"token"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	var filter bson.M

	if input.AssignmentId != "" {
		oid, err := primitive.ObjectIDFromHex(input.AssignmentId)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid assignment ID"})
		}
		filter = bson.M{"_id": oid}
	} else if input.Token != "" {
		filter = bson.M{"acceptanceToken": input.Token}
	} else {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Assignment ID or token required"})
	}

	var assignment bson.M
	if err := col.FindOne(ctx, filter).Decode(&assignment); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Assignment not found"})
	}

	col.UpdateOne(ctx, filter, bson.M{
		"$set": bson.M{
			"status":      "Accepted",
			"acceptedAt":  time.Now(),
			"respondedAt": time.Now(),
		},
	})

	reviewerEmail, _ := assignment["reviewerEmail"].(string)
	reviewerName, _ := assignment["reviewerName"].(string)
	submissionId, _ := assignment["submissionId"].(string)
	paperTitle, _ := assignment["paperTitle"].(string)

	go utils.SendReviewerAcceptanceEmail(reviewerEmail, reviewerName, map[string]interface{}{
		"submissionId": submissionId,
		"paperTitle":   paperTitle,
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Assignment accepted successfully"})
}

func RejectAssignment(c *fiber.Ctx) error {
	var input struct {
		AssignmentId             string `json:"assignmentId"`
		Token                    string `json:"token"`
		Reason                   string `json:"reason"`
		AlternativeReviewerEmail string `json:"alternativeReviewerEmail"`
		AlternativeReviewerName  string `json:"alternativeReviewerName"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	var filter bson.M

	if input.AssignmentId != "" {
		oid, err := primitive.ObjectIDFromHex(input.AssignmentId)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid assignment ID"})
		}
		filter = bson.M{"_id": oid}
	} else if input.Token != "" {
		filter = bson.M{"acceptanceToken": input.Token}
	} else {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Assignment ID or token required"})
	}

	var assignment bson.M
	if err := col.FindOne(ctx, filter).Decode(&assignment); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Assignment not found"})
	}

	updateFields := bson.M{
		"status":          "Rejected",
		"rejectionReason": input.Reason,
		"rejectedAt":      time.Now(),
		"respondedAt":     time.Now(),
	}
	if input.AlternativeReviewerEmail != "" {
		updateFields["alternativeReviewerEmail"] = input.AlternativeReviewerEmail
		updateFields["alternativeReviewerName"] = input.AlternativeReviewerName
	}
	col.UpdateOne(ctx, filter, bson.M{"$set": updateFields})

	reviewerEmail, _ := assignment["reviewerEmail"].(string)
	reviewerName, _ := assignment["reviewerName"].(string)
	submissionId, _ := assignment["submissionId"].(string)
	paperTitle, _ := assignment["paperTitle"].(string)

	go utils.SendReviewerRejectionNotification(reviewerEmail, reviewerName, map[string]interface{}{
		"submissionId": submissionId,
		"paperTitle":   paperTitle,
	}, input.Reason)

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Assignment declined"})
}

func SubmitReReview(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	var input struct {
		Comments          string `json:"comments"`
		CommentsToReviewer string `json:"commentsToReviewer"`
		CommentsToEditor  string `json:"commentsToEditor"`
		Strengths         string `json:"strengths"`
		Weaknesses        string `json:"weaknesses"`
		OverallRating     int    `json:"overallRating"`
		NoveltyRating     int    `json:"noveltyRating"`
		QualityRating     int    `json:"qualityRating"`
		ClarityRating     int    `json:"clarityRating"`
		Recommendation    string `json:"recommendation"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := papersCol.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}
	paperId, _ := paper["_id"].(primitive.ObjectID)

	now := time.Now()
	reReviewDoc := bson.M{
		"paperId":           paperId,
		"submissionId":      submissionId,
		"reviewerId":        reviewerObjId,
		"reviewerEmail":     claims.Email,
		"reviewerName":      claims.Username,
		"recommendation":    input.Recommendation,
		"overallRating":     input.OverallRating,
		"noveltyRating":     input.NoveltyRating,
		"qualityRating":     input.QualityRating,
		"clarityRating":     input.ClarityRating,
		"commentsToEditor":  input.CommentsToEditor,
		"commentsToReviewer": input.CommentsToReviewer,
		"strengths":         input.Strengths,
		"weaknesses":        input.Weaknesses,
		"status":            "submitted",
		"reviewRound":       2,
		"submittedAt":       now,
		"createdAt":         now,
		"updatedAt":         now,
	}

	reReviewsCol := config.GetCollection("rereviews")
	reReviewsCol.InsertOne(ctx, reReviewDoc)

	papersCol.UpdateOne(ctx, bson.M{"_id": paperId}, bson.M{
		"$set": bson.M{"status": "Re-Review Received", "updatedAt": now},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Re-review submitted"})
}

func AcceptAssignmentBySubmission(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	result, err := col.UpdateOne(ctx, bson.M{
		"submissionId": submissionId,
		"reviewerId":   reviewerObjId,
		"status":       "Pending",
	}, bson.M{
		"$set": bson.M{
			"status":      "Accepted",
			"acceptedAt":  time.Now(),
			"respondedAt": time.Now(),
		},
	})

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error updating assignment"})
	}
	if result.MatchedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "No pending assignment found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Assignment accepted"})
}

func GetMessageThreadReviewer(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	var thread bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId, "reviewerId": reviewerObjId}).Decode(&thread)

	return c.Status(200).JSON(fiber.Map{"success": true, "thread": thread})
}

func SendMessageReviewer(c *fiber.Ctx) error {
	var input struct {
		SubmissionId string `json:"submissionId"`
		Message      string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	msg := bson.M{
		"sender":      "Reviewer",
		"senderId":    reviewerObjId,
		"senderName":  claims.Username,
		"senderEmail": claims.Email,
		"message":     input.Message,
		"createdAt":   time.Now(),
	}

	var thread bson.M
	err := col.FindOne(ctx, bson.M{"submissionId": input.SubmissionId, "reviewerId": reviewerObjId}).Decode(&thread)
	if err != nil {
		doc := bson.M{
			"submissionId":  input.SubmissionId,
			"reviewerId":    reviewerObjId,
			"conversation":  bson.A{msg},
			"lastMessageAt": time.Now(),
			"status":        "active",
			"createdAt":     time.Now(),
			"updatedAt":     time.Now(),
		}
		col.InsertOne(ctx, doc)
	} else {
		col.UpdateOne(ctx, bson.M{"submissionId": input.SubmissionId, "reviewerId": reviewerObjId}, bson.M{
			"$push": bson.M{"conversation": msg},
			"$set":  bson.M{"lastMessageAt": time.Now(), "updatedAt": time.Now()},
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent"})
}

func GetAllMessageThreadsReviewer(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	reviewerObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	cursor, _ := col.Find(ctx, bson.M{"reviewerId": reviewerObjId})
	defer cursor.Close(ctx)
	var threads []bson.M
	cursor.All(ctx, &threads)

	return c.Status(200).JSON(fiber.Map{"success": true, "threads": threads})
}
