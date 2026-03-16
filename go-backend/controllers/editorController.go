package controllers

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func VerifyEditorAccess(c *fiber.Ctx) error {
	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Editor access verified"})
}

func GetAssignedPapersEditor(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	editorId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{"assignedEditor": editorId}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching papers"})
	}
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func CreateReviewer(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}
	if input.Email == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Email is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var existing bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&existing); err == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "User with this email already exists"})
	}

	password := input.Password
	if password == "" {
		password = utils.GenerateRandomPassword()
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), 10)

	username := input.Username
	if username == "" {
		for i, ch := range input.Email {
			if ch == '@' {
				username = input.Email[:i]
				break
			}
		}
	}

	doc := bson.M{
		"username":     username,
		"email":        input.Email,
		"password":     string(hash),
		"tempPassword": password,
		"role":         "Reviewer",
		"verified":     true,
		"createdAt":    time.Now(),
	}

	result, err := col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error creating reviewer"})
	}

	go utils.SendReviewerCredentialsEmail(input.Email, username, password, "")

	return c.Status(201).JSON(fiber.Map{
		"success": true,
		"message": "Reviewer account created successfully",
		"reviewer": fiber.Map{
			"_id":      result.InsertedID,
			"email":    input.Email,
			"username": username,
			"role":     "Reviewer",
		},
	})
}

func GetAllReviewers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	opts := options.Find().SetProjection(bson.M{"password": 0}).SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, bson.M{"role": "Reviewer"}, opts)
	defer cursor.Close(ctx)
	var reviewers []bson.M
	cursor.All(ctx, &reviewers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(reviewers), "reviewers": reviewers})
}

func AssignReviewers(c *fiber.Ctx) error {
	var input struct {
		PaperId      string   `json:"paperId"`
		ReviewerIds  []string `json:"reviewerIds"`
		Deadline     string   `json:"deadline"`
		DeadlineDays int      `json:"deadlineDays"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	paperObjId, err := primitive.ObjectIDFromHex(input.PaperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"_id": paperObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	var deadline time.Time
	if input.Deadline != "" {
		deadline, _ = time.Parse(time.RFC3339, input.Deadline)
	} else {
		days := input.DeadlineDays
		if days <= 0 {
			days = 14
		}
		deadline = time.Now().Add(time.Duration(days) * 24 * time.Hour)
	}

	usersCol := config.GetCollection("users")
	assignmentsCol := config.GetCollection("reviewerassignments")

	var newAssignments []interface{}
	for _, reviewerId := range input.ReviewerIds {
		rObjId, err := primitive.ObjectIDFromHex(reviewerId)
		if err != nil {
			continue
		}
		var reviewer bson.M
		if err := usersCol.FindOne(ctx, bson.M{"_id": rObjId}).Decode(&reviewer); err != nil {
			continue
		}

		assignment := bson.M{
			"reviewer":    rObjId,
			"deadline":    deadline,
			"status":      "Pending",
			"assignedAt":  time.Now(),
			"emailSent":   false,
			"emailResent": false,
		}
		newAssignments = append(newAssignments, assignment)

		// Create ReviewerAssignment doc
		assignmentDoc := bson.M{
			"paperId":        paperObjId,
			"submissionId":   paper["submissionId"],
			"reviewerId":     rObjId,
			"reviewerEmail":  reviewer["email"],
			"reviewerName":   reviewer["username"],
			"paperTitle":     paper["paperTitle"],
			"abstract":       paper["abstract"],
			"status":         "Pending",
			"reviewDeadline": deadline,
			"createdAt":      time.Now(),
		}

		result, err := assignmentsCol.InsertOne(ctx, assignmentDoc)
		if err != nil {
			log.Printf("Error inserting reviewer assignment: %v", err)
			continue
		}

		assignmentId := result.InsertedID.(primitive.ObjectID).Hex()
		rEmail, _ := reviewer["email"].(string)
		rName, _ := reviewer["username"].(string)
		submissionId, _ := paper["submissionId"].(string)
		paperTitle, _ := paper["paperTitle"].(string)
		category, _ := paper["category"].(string)
		abstract, _ := paper["abstract"].(string)

		go utils.SendReviewerConfirmationEmail(rEmail, rName, utils.ReviewerPaperData{
			SubmissionId: submissionId,
			PaperTitle:   paperTitle,
			Category:     category,
			Abstract:     abstract,
			Deadline:     deadline,
		}, assignmentId)
	}

	reviewerObjIds := make([]primitive.ObjectID, 0)
	for _, rid := range input.ReviewerIds {
		if oid, err := primitive.ObjectIDFromHex(rid); err == nil {
			reviewerObjIds = append(reviewerObjIds, oid)
		}
	}

	update := bson.M{
		"$push": bson.M{"reviewAssignments": bson.M{"$each": newAssignments}},
		"$addToSet": bson.M{"assignedReviewers": bson.M{"$each": reviewerObjIds}},
		"$set":   bson.M{"status": "Under Review", "updatedAt": time.Now()},
	}
	col.UpdateOne(ctx, bson.M{"_id": paperObjId}, update)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("%d reviewer(s) added successfully", len(input.ReviewerIds)),
	})
}

func GetPaperReviews(c *fiber.Ctx) error {
	paperId := c.Params("paperId")
	paperObjId, err := primitive.ObjectIDFromHex(paperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	reviewsCol := config.GetCollection("reviewerreviews")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := reviewsCol.Find(ctx, bson.M{"paper": paperObjId}, opts)
	defer cursor.Close(ctx)
	var reviews []bson.M
	cursor.All(ctx, &reviews)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(reviews), "reviews": reviews})
}

func MakeFinalDecision(c *fiber.Ctx) error {
	var input struct {
		PaperId     string `json:"paperId"`
		Decision    string `json:"decision"`
		Comments    string `json:"comments"`
		Corrections string `json:"corrections"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	validDecisions := map[string]bool{"Accept": true, "Conditionally Accept": true, "Revise & Resubmit": true, "Reject": true}
	if !validDecisions[input.Decision] {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid decision"})
	}

	paperObjId, err := primitive.ObjectIDFromHex(input.PaperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"_id": paperObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	statusMap := map[string]string{
		"Accept":               "Accepted",
		"Conditionally Accept": "Conditionally Accept",
		"Revise & Resubmit":    "Revision Required",
		"Reject":               "Rejected",
	}

	col.UpdateOne(ctx, bson.M{"_id": paperObjId}, bson.M{
		"$set": bson.M{
			"finalDecision":     input.Decision,
			"editorComments":    input.Comments,
			"editorCorrections": input.Corrections,
			"status":            statusMap[input.Decision],
			"updatedAt":         time.Now(),
		},
	})

	authorEmail, _ := paper["email"].(string)
	authorName, _ := paper["authorName"].(string)
	submissionId, _ := paper["submissionId"].(string)
	paperTitle, _ := paper["paperTitle"].(string)

	go utils.SendDecisionEmail(authorEmail, authorName, utils.DecisionData{
		SubmissionId: submissionId,
		PaperTitle:   paperTitle,
		Decision:     input.Decision,
		Comments:     input.Comments,
		Corrections:  input.Corrections,
	})

	utils.EmitToUser(authorEmail, "paper:status_changed", fiber.Map{
		"submissionId": submissionId,
		"status":       statusMap[input.Decision],
		"decision":     input.Decision,
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Decision submitted successfully"})
}

func GetEditorDashboardStats(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	editorId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	totalAssigned, _ := col.CountDocuments(ctx, bson.M{"assignedEditor": editorId})
	underReview, _ := col.CountDocuments(ctx, bson.M{"assignedEditor": editorId, "status": "Under Review"})
	reviewReceived, _ := col.CountDocuments(ctx, bson.M{"assignedEditor": editorId, "status": "Review Received"})

	pipeline := []bson.M{
		{"$match": bson.M{"assignedEditor": editorId}},
		{"$group": bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}},
	}
	cursor, _ := col.Aggregate(ctx, pipeline)
	var papersByStatus []bson.M
	cursor.All(ctx, &papersByStatus)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"stats": fiber.Map{
			"totalAssigned":  totalAssigned,
			"underReview":    underReview,
			"awaitingDecision": reviewReceived,
			"papersByStatus": papersByStatus,
		},
	})
}

func GetAllPapersEditor(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	statusFilter := c.Query("status")
	categoryFilter := c.Query("category")
	search := c.Query("search")

	query := bson.M{}
	if statusFilter != "" {
		query["status"] = statusFilter
	}
	if categoryFilter != "" {
		query["category"] = categoryFilter
	}
	if search != "" {
		query["$or"] = bson.A{
			bson.M{"submissionId": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"paperTitle": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"authorName": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, query, opts)
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func GetPdfBase64(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	pdfUrl, _ := paper["pdfUrl"].(string)
	if pdfUrl == "" {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "No PDF available"})
	}

	resp, err := http.Get(pdfUrl)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching PDF"})
	}
	defer resp.Body.Close()

	pdfBytes, _ := io.ReadAll(resp.Body)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"pdfUrl":  pdfUrl,
		"size":    len(pdfBytes),
		"paper":   paper,
	})
}

func GetReviewerDetails(c *fiber.Ctx) error {
	reviewId := c.Params("reviewId")
	reviewObjId, err := primitive.ObjectIDFromHex(reviewId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid review ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerreviews")
	var review bson.M
	if err := col.FindOne(ctx, bson.M{"_id": reviewObjId}).Decode(&review); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Review not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "review": review})
}

func SendMessageEditor(c *fiber.Ctx) error {
	var input struct {
		SubmissionId string `json:"submissionId"`
		ReviewId     string `json:"reviewId"`
		Message      string `json:"message"`
		Recipient    string `json:"recipient"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	claims := c.Locals("user").(*middleware.JWTClaims)
	senderId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	var thread bson.M
	col.FindOne(ctx, bson.M{"submissionId": input.SubmissionId}).Decode(&thread)

	msg := bson.M{
		"sender":      claims.Role,
		"senderId":    senderId,
		"senderName":  claims.Username,
		"senderEmail": claims.Email,
		"message":     input.Message,
		"createdAt":   time.Now(),
	}

	if thread == nil {
		doc := bson.M{
			"submissionId": input.SubmissionId,
			"editorId":     senderId,
			"conversation": bson.A{msg},
			"lastMessageAt": time.Now(),
			"status":       "active",
			"createdAt":    time.Now(),
			"updatedAt":    time.Now(),
		}
		col.InsertOne(ctx, doc)
	} else {
		col.UpdateOne(ctx, bson.M{"submissionId": input.SubmissionId}, bson.M{
			"$push": bson.M{"conversation": msg},
			"$set":  bson.M{"lastMessageAt": time.Now(), "updatedAt": time.Now()},
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent"})
}

func GetMessageThread(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	var thread bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&thread)

	return c.Status(200).JSON(fiber.Map{"success": true, "thread": thread})
}

func GetPaperMessagesEditor(c *fiber.Ctx) error {
	paperId := c.Params("paperId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewermessages")
	cursor, _ := col.Find(ctx, bson.M{"submissionId": paperId})
	defer cursor.Close(ctx)
	var threads []bson.M
	cursor.All(ctx, &threads)

	return c.Status(200).JSON(fiber.Map{"success": true, "threads": threads})
}

func GetAllMessages(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("reviewermessages")
	cursor, _ := col.Find(ctx, bson.M{})
	defer cursor.Close(ctx)
	var threads []bson.M
	cursor.All(ctx, &threads)
	return c.Status(200).JSON(fiber.Map{"success": true, "threads": threads})
}

func GetNonRespondingReviewers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	cursor, _ := col.Find(ctx, bson.M{"status": "Pending"})
	defer cursor.Close(ctx)
	var assignments []bson.M
	cursor.All(ctx, &assignments)

	return c.Status(200).JSON(fiber.Map{"success": true, "assignments": assignments})
}

func SendReviewerReminder(c *fiber.Ctx) error {
	var input struct {
		ReviewerEmail string `json:"reviewerEmail"`
		ReviewerName  string `json:"reviewerName"`
		PaperTitle    string `json:"paperTitle"`
		ReviewLink    string `json:"reviewLink"`
		DaysRemaining int    `json:"daysRemaining"`
		ReminderCount int    `json:"reminderCount"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if err := utils.SendReviewerReminderEmail(input.ReviewerEmail, input.ReviewerName, input.PaperTitle, input.ReminderCount, input.ReviewLink, input.DaysRemaining); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending reminder"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Reminder sent"})
}

func SendBulkReminders(c *fiber.Ctx) error {
	var input struct {
		PaperId string `json:"paperId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerassignments")
	cursor, _ := col.Find(ctx, bson.M{"status": "Pending"})
	defer cursor.Close(ctx)
	var assignments []bson.M
	cursor.All(ctx, &assignments)

	sent := 0
	for _, a := range assignments {
		rEmail, _ := a["reviewerEmail"].(string)
		rName, _ := a["reviewerName"].(string)
		pTitle, _ := a["paperTitle"].(string)
		if rEmail != "" {
			utils.SendReviewerReminderEmail(rEmail, rName, pTitle, 1, utils.FrontendURL()+"/reviewer/dashboard", 7)
			sent++
		}
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": fmt.Sprintf("%d reminders sent", sent)})
}

func GetAllPdfsEditor(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("papersubmissions")
	cursor, _ := col.Find(ctx, bson.M{"pdfUrl": bson.M{"$ne": ""}})
	defer cursor.Close(ctx)
	var pdfs []bson.M
	cursor.All(ctx, &pdfs)
	return c.Status(200).JSON(fiber.Map{"success": true, "pdfs": pdfs})
}

func DeletePdfEditor(c *fiber.Ctx) error {
	return DeletePdfAdmin(c)
}

func SendMessageToReviewer(c *fiber.Ctx) error {
	return SendMessageEditor(c)
}

func SendMessageToAuthor(c *fiber.Ctx) error {
	return SendMessageEditor(c)
}

func RequestRevision(c *fiber.Ctx) error {
	var input struct {
		PaperId        string `json:"paperId"`
		SubmissionId   string `json:"submissionId"`
		EditorComments string `json:"editorComments"`
		Deadline       string `json:"deadline"`
		DeadlineDays   int    `json:"deadlineDays"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var filter bson.M
	if input.PaperId != "" {
		oid, _ := primitive.ObjectIDFromHex(input.PaperId)
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"submissionId": input.SubmissionId}
	}

	var paper bson.M
	if err := col.FindOne(ctx, filter).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	var deadline time.Time
	if input.Deadline != "" {
		deadline, _ = time.Parse(time.RFC3339, input.Deadline)
	} else {
		days := input.DeadlineDays
		if days <= 0 {
			days = 14
		}
		deadline = time.Now().Add(time.Duration(days) * 24 * time.Hour)
	}

	revisionCount, _ := paper["revisionCount"].(int32)
	newCount := int(revisionCount) + 1

	revisionRequest := bson.M{
		"revisionNumber": newCount,
		"requestedAt":    time.Now(),
		"editorComments": input.EditorComments,
		"deadline":       deadline,
		"status":         "Pending",
	}

	col.UpdateOne(ctx, filter, bson.M{
		"$set":  bson.M{"status": "Revision Required", "revisionCount": newCount, "updatedAt": time.Now()},
		"$push": bson.M{"revisionRequests": revisionRequest},
	})

	authorEmail, _ := paper["email"].(string)
	authorName, _ := paper["authorName"].(string)
	submissionId, _ := paper["submissionId"].(string)
	paperTitle, _ := paper["paperTitle"].(string)

	go utils.SendRevisionRequestEmail(authorEmail, authorName, map[string]interface{}{
		"submissionId":   submissionId,
		"paperTitle":     paperTitle,
		"editorComments": input.EditorComments,
	})

	utils.EmitToUser(authorEmail, "paper:revision_requested", fiber.Map{
		"submissionId": submissionId,
		"status":       "Revision Required",
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Revision requested successfully"})
}

func AcceptPaper(c *fiber.Ctx) error {
	var input struct {
		PaperId      string `json:"paperId"`
		SubmissionId string `json:"submissionId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	claims := c.Locals("user").(*middleware.JWTClaims)
	editorId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var filter bson.M
	if input.PaperId != "" {
		oid, _ := primitive.ObjectIDFromHex(input.PaperId)
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"submissionId": input.SubmissionId}
	}

	var paper bson.M
	if err := col.FindOne(ctx, filter).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	col.UpdateOne(ctx, filter, bson.M{
		"$set": bson.M{"status": "Accepted", "finalDecision": "Accept", "updatedAt": time.Now()},
	})

	// Create FinalAcceptance record
	faCol := config.GetCollection("finalacceptances")
	paperId, _ := paper["_id"].(primitive.ObjectID)
	faDoc := bson.M{
		"paperId":         paperId,
		"submissionId":    paper["submissionId"],
		"paperTitle":      paper["paperTitle"],
		"authorName":      paper["authorName"],
		"authorEmail":     paper["email"],
		"pdfUrl":          paper["pdfUrl"],
		"pdfPublicId":     paper["pdfPublicId"],
		"pdfFileName":     paper["pdfFileName"],
		"category":        paper["category"],
		"topic":           paper["topic"],
		"editorId":        editorId,
		"editorEmail":     claims.Email,
		"finalDecision":   "Accept",
		"acceptanceDate":  time.Now(),
		"revisionCount":   paper["revisionCount"],
		"paymentStatus":   "pending",
		"status":          "accepted",
		"conferenceName":  "ICMBNT 2026",
		"conferenceYear":  2026,
		"createdAt":       time.Now(),
		"updatedAt":       time.Now(),
	}
	faCol.InsertOne(ctx, faDoc)

	authorEmail, _ := paper["email"].(string)
	authorName, _ := paper["authorName"].(string)
	paperTitle, _ := paper["paperTitle"].(string)
	submissionId, _ := paper["submissionId"].(string)

	go utils.SendAcceptanceEmail(authorEmail, authorName, paperTitle, submissionId)
	utils.EmitToUser(authorEmail, "paper:accepted", fiber.Map{
		"submissionId": submissionId,
		"paperTitle":   paperTitle,
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Paper accepted successfully"})
}

func RejectPaper(c *fiber.Ctx) error {
	paperId := c.Params("paperId")
	paperObjId, err := primitive.ObjectIDFromHex(paperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}

	var input struct {
		Reason   string `json:"reason"`
		Comments string `json:"comments"`
	}
	c.BodyParser(&input)

	claims := c.Locals("user").(*middleware.JWTClaims)
	editorId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"_id": paperObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	col.UpdateOne(ctx, bson.M{"_id": paperObjId}, bson.M{
		"$set": bson.M{"status": "Rejected", "finalDecision": "Reject", "editorComments": input.Comments, "updatedAt": time.Now()},
	})

	// Create RejectedPaper record
	rpCol := config.GetCollection("rejectedpapers")
	pid, _ := paper["_id"].(primitive.ObjectID)
	rpDoc := bson.M{
		"paperId":           pid,
		"submissionId":      paper["submissionId"],
		"paperTitle":        paper["paperTitle"],
		"authorName":        paper["authorName"],
		"authorEmail":       paper["email"],
		"pdfUrl":            paper["pdfUrl"],
		"category":          paper["category"],
		"rejectionReason":   input.Reason,
		"rejectionComments": input.Comments,
		"editorId":          editorId,
		"editorEmail":       claims.Email,
		"rejectionDate":     time.Now(),
		"revisionCount":     paper["revisionCount"],
		"conferenceName":    "ICMBNT 2026",
		"conferenceYear":    2026,
		"createdAt":         time.Now(),
		"updatedAt":         time.Now(),
	}
	rpCol.InsertOne(ctx, rpDoc)

	authorEmail, _ := paper["email"].(string)
	authorName, _ := paper["authorName"].(string)
	submissionId, _ := paper["submissionId"].(string)
	paperTitle, _ := paper["paperTitle"].(string)

	go utils.SendDecisionEmail(authorEmail, authorName, utils.DecisionData{
		SubmissionId: submissionId,
		PaperTitle:   paperTitle,
		Decision:     "Reject",
		Comments:     input.Comments,
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Paper rejected"})
}

func GetRevisionStatus(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}
	return c.Status(200).JSON(fiber.Map{"success": true, "paper": paper})
}

func SubmitRevisedPaperEditor(c *fiber.Ctx) error {
	return SubmitRevision(c)
}

func RemoveReviewerFromPaper(c *fiber.Ctx) error {
	var input struct {
		PaperId    string `json:"paperId"`
		ReviewerId string `json:"reviewerId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	paperObjId, _ := primitive.ObjectIDFromHex(input.PaperId)
	reviewerObjId, _ := primitive.ObjectIDFromHex(input.ReviewerId)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	col.UpdateOne(ctx, bson.M{"_id": paperObjId}, bson.M{
		"$pull":  bson.M{"assignedReviewers": reviewerObjId, "reviewAssignments": bson.M{"reviewer": reviewerObjId}},
		"$set":   bson.M{"updatedAt": time.Now()},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Reviewer removed"})
}

func SendReviewerInquiry(c *fiber.Ctx) error {
	var input struct {
		ReviewerEmail string `json:"reviewerEmail"`
		ReviewerName  string `json:"reviewerName"`
		Message       string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if err := utils.SendEditorMessageEmail(input.ReviewerEmail, input.ReviewerName, input.Message); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending inquiry"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Inquiry sent"})
}

func SendReReviewEmails(c *fiber.Ctx) error {
	var input struct {
		PaperId    string   `json:"paperId"`
		ReviewerIds []string `json:"reviewerIds"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	paperObjId, _ := primitive.ObjectIDFromHex(input.PaperId)
	papersCol := config.GetCollection("papersubmissions")
	var paper bson.M
	papersCol.FindOne(ctx, bson.M{"_id": paperObjId}).Decode(&paper)

	usersCol := config.GetCollection("users")
	for _, rid := range input.ReviewerIds {
		rObjId, _ := primitive.ObjectIDFromHex(rid)
		var reviewer bson.M
		if err := usersCol.FindOne(ctx, bson.M{"_id": rObjId}).Decode(&reviewer); err != nil {
			continue
		}
		rEmail, _ := reviewer["email"].(string)
		rName, _ := reviewer["username"].(string)
		go utils.SendReReviewEmail(rEmail, rName, map[string]interface{}{
			"submissionId": paper["submissionId"],
			"paperTitle":   paper["paperTitle"],
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Re-review emails sent"})
}

func DeleteReview(c *fiber.Ctx) error {
	reviewId := c.Params("reviewId")
	reviewObjId, err := primitive.ObjectIDFromHex(reviewId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid review ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerreviews")
	result, err := col.DeleteOne(ctx, bson.M{"_id": reviewObjId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Review not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Review deleted"})
}

func UpdateReview(c *fiber.Ctx) error {
	reviewId := c.Params("reviewId")
	reviewObjId, err := primitive.ObjectIDFromHex(reviewId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid review ID"})
	}

	var updateBody bson.M
	if err := c.BodyParser(&updateBody); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}
	updateBody["updatedAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("reviewerreviews")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": reviewObjId}, bson.M{"$set": updateBody}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Review not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "review": updated})
}

func GetPaperReReviews(c *fiber.Ctx) error {
	paperId := c.Params("paperId")
	paperObjId, _ := primitive.ObjectIDFromHex(paperId)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("rereviews")
	cursor, _ := col.Find(ctx, bson.M{"paperId": paperObjId})
	defer cursor.Close(ctx)
	var reviews []bson.M
	cursor.All(ctx, &reviews)

	return c.Status(200).JSON(fiber.Map{"success": true, "reviews": reviews})
}

func UpdateReviewerDetails(c *fiber.Ctx) error {
	reviewerId := c.Params("reviewerId")
	reviewerObjId, err := primitive.ObjectIDFromHex(reviewerId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid reviewer ID"})
	}

	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}
	delete(input, "password")
	delete(input, "role")
	input["updatedAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"password": 0})
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": reviewerObjId}, bson.M{"$set": input}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Reviewer not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "reviewer": updated})
}

func DeleteReviewerFromSystem(c *fiber.Ctx) error {
	reviewerId := c.Params("reviewerId")
	reviewerObjId, err := primitive.ObjectIDFromHex(reviewerId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid reviewer ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	result, err := col.DeleteOne(ctx, bson.M{"_id": reviewerObjId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Reviewer not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Reviewer deleted"})
}

func GetAllAcceptedPapers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("finalacceptances")
	opts := options.Find().SetSort(bson.M{"acceptanceDate": -1})
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)
	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func GetAcceptedPapersByCategory(c *fiber.Ctx) error {
	category := c.Params("category")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("finalacceptances")
	cursor, _ := col.Find(ctx, bson.M{"category": category})
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)
	return c.Status(200).JSON(fiber.Map{"success": true, "papers": papers})
}

func GetAcceptedPapersByAuthor(c *fiber.Ctx) error {
	email := c.Params("email")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("finalacceptances")
	cursor, _ := col.Find(ctx, bson.M{"authorEmail": email})
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)
	return c.Status(200).JSON(fiber.Map{"success": true, "papers": papers})
}

func GetHighRatedPapers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("finalacceptances")
	opts := options.Find().SetSort(bson.M{"averageRating": -1}).SetLimit(10)
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)
	return c.Status(200).JSON(fiber.Map{"success": true, "papers": papers})
}

func GetAcceptedPaperDetails(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col := config.GetCollection("finalacceptances")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}
	return c.Status(200).JSON(fiber.Map{"success": true, "paper": paper})
}

func GetAcceptanceStatistics(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	faCol := config.GetCollection("finalacceptances")
	rpCol := config.GetCollection("rejectedpapers")

	totalAccepted, _ := faCol.CountDocuments(ctx, bson.M{})
	totalRejected, _ := rpCol.CountDocuments(ctx, bson.M{})

	pipeline := []bson.M{{"$group": bson.M{"_id": "$category", "count": bson.M{"$sum": 1}}}}
	cursor, _ := faCol.Aggregate(ctx, pipeline)
	var byCategory []bson.M
	cursor.All(ctx, &byCategory)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"stats": fiber.Map{
			"totalAccepted": totalAccepted,
			"totalRejected": totalRejected,
			"byCategory":    byCategory,
		},
	})
}

func UpdateAcceptanceStatus(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	var input struct {
		Status        string `json:"status"`
		PaymentStatus string `json:"paymentStatus"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	update := bson.M{"updatedAt": time.Now()}
	if input.Status != "" {
		update["status"] = input.Status
	}
	if input.PaymentStatus != "" {
		update["paymentStatus"] = input.PaymentStatus
	}

	col := config.GetCollection("finalacceptances")
	result, _ := col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{"$set": update})

	if result == nil || result.MatchedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Status updated"})
}
