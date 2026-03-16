package controllers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func DebugMyPapers(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	userEmail := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	faCol := config.GetCollection("finalacceptances")

	// Exact match
	cursor, _ := papersCol.Find(ctx, bson.M{"email": userEmail},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "status": 1, "createdAt": 1}))
	var submissions []bson.M
	cursor.All(ctx, &submissions)

	cursor2, _ := faCol.Find(ctx, bson.M{"authorEmail": userEmail},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "acceptanceDate": 1, "paymentStatus": 1}))
	var acceptances []bson.M
	cursor2.All(ctx, &acceptances)

	// Case-insensitive
	cursor3, _ := papersCol.Find(ctx, bson.M{"email": bson.M{"$regex": "^" + userEmail + "$", "$options": "i"}},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "email": 1, "status": 1, "createdAt": 1}))
	var submissionsCI []bson.M
	cursor3.All(ctx, &submissionsCI)

	cursor4, _ := faCol.Find(ctx, bson.M{"authorEmail": bson.M{"$regex": "^" + userEmail + "$", "$options": "i"}},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "authorEmail": 1, "acceptanceDate": 1, "paymentStatus": 1}))
	var acceptancesCI []bson.M
	cursor4.All(ctx, &acceptancesCI)

	hasAcceptances := len(acceptances) > 0 || len(acceptancesCI) > 0
	hasSubmissions := len(submissions) > 0 || len(submissionsCI) > 0

	diagnosis := fiber.Map{
		"hasSubmissions":     hasSubmissions,
		"hasAcceptances":     hasAcceptances,
		"shouldShowAsAuthor": hasAcceptances,
		"reason": func() string {
			if hasAcceptances {
				return "User has accepted papers and should show as Author"
			}
			if hasSubmissions {
				return "User has submissions but no accepted papers yet"
			}
			return "No papers found for this user"
		}(),
	}

	return c.Status(200).JSON(fiber.Map{
		"success":   true,
		"userEmail": userEmail,
		"summary": fiber.Map{
			"totalSubmissions":   len(submissions),
			"totalAcceptances":   len(acceptances),
			"totalSubmissionsCI": len(submissionsCI),
			"totalAcceptancesCI": len(acceptancesCI),
		},
		"submissions": fiber.Map{
			"exact":          submissions,
			"caseInsensitive": submissionsCI,
		},
		"acceptances": fiber.Map{
			"exact":          acceptances,
			"caseInsensitive": acceptancesCI,
		},
		"diagnosis": diagnosis,
	})
}

func DebugSearchPapers(c *fiber.Ctx) error {
	searchEmail := c.Params("email")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	faCol := config.GetCollection("finalacceptances")

	cursor, _ := papersCol.Find(ctx, bson.M{"email": bson.M{"$regex": "^" + searchEmail + "$", "$options": "i"}},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "email": 1, "status": 1, "createdAt": 1}))
	var submissions []bson.M
	cursor.All(ctx, &submissions)

	cursor2, _ := faCol.Find(ctx, bson.M{"authorEmail": bson.M{"$regex": "^" + searchEmail + "$", "$options": "i"}},
		options.Find().SetProjection(bson.M{"submissionId": 1, "paperTitle": 1, "authorEmail": 1, "acceptanceDate": 1, "paymentStatus": 1}))
	var acceptances []bson.M
	cursor2.All(ctx, &acceptances)

	return c.Status(200).JSON(fiber.Map{
		"success":     true,
		"searchEmail": searchEmail,
		"found": fiber.Map{
			"submissions": len(submissions),
			"acceptances": len(acceptances),
		},
		"submissions": submissions,
		"acceptances": acceptances,
	})
}

func GetPaperCount(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	total, _ := col.CountDocuments(ctx, bson.M{})
	accepted, _ := col.CountDocuments(ctx, bson.M{"status": "Accepted"})
	underReview, _ := col.CountDocuments(ctx, bson.M{"status": "Under Review"})
	pending, _ := col.CountDocuments(ctx, bson.M{"status": "Submitted"})

	pipeline := []bson.M{{"$group": bson.M{"_id": "$category", "count": bson.M{"$sum": 1}}}}
	cursor, _ := col.Aggregate(ctx, pipeline)
	var byCategory []bson.M
	cursor.All(ctx, &byCategory)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"counts": fiber.Map{
			"total":       total,
			"accepted":    accepted,
			"underReview": underReview,
			"pending":     pending,
			"byCategory":  byCategory,
		},
	})
}

func GetSubmittedPaperCount(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	total, _ := col.CountDocuments(ctx, bson.M{})

	return c.Status(200).JSON(fiber.Map{"success": true, "count": total})
}

// Payment registration controllers

func SubmitPaymentRegistration(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	userEmail := claims.Email

	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Check for accepted paper
	faCol := config.GetCollection("finalacceptances")
	var acceptedPaper bson.M
	if err := faCol.FindOne(ctx, bson.M{"authorEmail": userEmail}).Decode(&acceptedPaper); err != nil {
		return c.Status(404).JSON(fiber.Map{
			"success": false,
			"message": "No accepted paper found. Only accepted authors can register.",
		})
	}

	// Check existing registration
	prCol := config.GetCollection("paymentregistrations")
	var existing bson.M
	if err := prCol.FindOne(ctx, bson.M{"authorEmail": userEmail, "paymentStatus": bson.M{"$in": bson.A{"pending", "verified"}}}).Decode(&existing); err == nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"message": "You have already submitted a registration.",
			"existingRegistration": fiber.Map{
				"paymentStatus":    existing["paymentStatus"],
				"registrationDate": existing["createdAt"],
			},
		})
	}

	input["authorEmail"] = userEmail
	input["authorName"] = claims.Username
	if _, ok := input["paymentStatus"]; !ok {
		input["paymentStatus"] = "pending"
	}
	if acceptedPaper != nil {
		input["submissionId"] = acceptedPaper["submissionId"]
		input["paperTitle"] = acceptedPaper["paperTitle"]
	}
	now := time.Now()
	input["registrationDate"] = now
	input["createdAt"] = now
	input["updatedAt"] = now

	result, err := prCol.InsertOne(ctx, input)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error saving registration"})
	}

	return c.Status(201).JSON(fiber.Map{
		"success":        true,
		"message":        "Registration submitted successfully",
		"registrationId": result.InsertedID,
	})
}

func GetMyPaymentRegistration(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("paymentregistrations")
	opts := options.FindOne().SetSort(bson.M{"createdAt": -1})
	var registration bson.M
	col.FindOne(ctx, bson.M{"authorEmail": claims.Email}, opts).Decode(&registration)

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"registration": registration,
	})
}

func GetAllPaymentRegistrations(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	status := c.Query("status")
	query := bson.M{}
	if status != "" {
		query["paymentStatus"] = status
	}

	col := config.GetCollection("paymentregistrations")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, query, opts)
	defer cursor.Close(ctx)
	var registrations []bson.M
	cursor.All(ctx, &registrations)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(registrations), "registrations": registrations})
}

func VerifyPaymentRegistration(c *fiber.Ctx) error {
	id := c.Params("id")
	objId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid ID"})
	}

	var input struct {
		AdminNotes string `json:"adminNotes"`
	}
	c.BodyParser(&input)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("paymentregistrations")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": objId}, bson.M{
		"$set": bson.M{
			"paymentStatus":  "verified",
			"verifiedAt":     time.Now(),
			"adminNotes":     input.AdminNotes,
			"updatedAt":      time.Now(),
		},
	}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Registration not found"})
	}

	// Update FinalAcceptance payment status
	faCol := config.GetCollection("finalacceptances")
	if authorEmail, ok := updated["authorEmail"].(string); ok {
		faCol.UpdateMany(ctx, bson.M{"authorEmail": authorEmail}, bson.M{
			"$set": bson.M{"paymentStatus": "paid", "updatedAt": time.Now()},
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"message":      "Payment verified",
		"registration": updated,
	})
}

func RejectPaymentRegistration(c *fiber.Ctx) error {
	id := c.Params("id")
	objId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid ID"})
	}

	var input struct {
		Reason string `json:"reason"`
	}
	c.BodyParser(&input)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("paymentregistrations")
	col.UpdateOne(ctx, bson.M{"_id": objId}, bson.M{
		"$set": bson.M{
			"paymentStatus":  "rejected",
			"rejectionReason": input.Reason,
			"rejectedAt":     time.Now(),
			"updatedAt":      time.Now(),
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Payment registration rejected"})
}

func GetConferenceRegistrationData(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	userEmail := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	faCol := config.GetCollection("finalacceptances")
	prCol := config.GetCollection("paymentregistrations")

	var acceptedPaper bson.M
	faCol.FindOne(ctx, bson.M{"authorEmail": userEmail}, options.FindOne().SetSort(bson.M{"acceptanceDate": -1})).Decode(&acceptedPaper)

	var paymentReg bson.M
	prCol.FindOne(ctx, bson.M{"authorEmail": userEmail}, options.FindOne().SetSort(bson.M{"createdAt": -1})).Decode(&paymentReg)

	return c.Status(200).JSON(fiber.Map{
		"success":     true,
		"hasAccepted": acceptedPaper != nil,
		"paper":       acceptedPaper,
		"registration": paymentReg,
	})
}
