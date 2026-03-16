package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetAllPendingPapers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	pendingStatuses := bson.A{"Submitted", "Under Review", "Review Received", "Revision Required", "Revision Submitted"}
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, bson.M{"status": bson.M{"$in": pendingStatuses}}, opts)
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func AdminDirectAcceptPaper(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	var input struct {
		SubmissionId  string `json:"submissionId"`
		PaperId       string `json:"paperId"`
		AdminComments string `json:"adminComments"`
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

	editorId, _ := primitive.ObjectIDFromHex(claims.UserID)
	now := time.Now()

	col.UpdateOne(ctx, filter, bson.M{
		"$set": bson.M{
			"status":        "Accepted",
			"finalDecision": "Accept",
			"editorComments": input.AdminComments,
			"updatedAt":     now,
		},
	})

	paperId, _ := paper["_id"].(primitive.ObjectID)
	faDoc := bson.M{
		"paperId":          paperId,
		"submissionId":     paper["submissionId"],
		"paperTitle":       paper["paperTitle"],
		"authorName":       paper["authorName"],
		"authorEmail":      paper["email"],
		"pdfUrl":           paper["pdfUrl"],
		"pdfPublicId":      paper["pdfPublicId"],
		"pdfFileName":      paper["pdfFileName"],
		"category":         paper["category"],
		"topic":            paper["topic"],
		"editorId":         editorId,
		"editorEmail":      claims.Email,
		"finalDecision":    "Accept",
		"acceptanceDate":   now,
		"adminAccepted":    true,
		"adminComments":    input.AdminComments,
		"paymentStatus":    "pending",
		"status":           "accepted",
		"conferenceName":   "ICMBNT 2026",
		"conferenceYear":   2026,
		"createdAt":        now,
		"updatedAt":        now,
	}

	faCol := config.GetCollection("finalacceptances")
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

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Paper accepted directly by admin"})
}

func AdminUploadCameraReady(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	file, err := c.FormFile("cameraReadyPdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Camera ready PDF is required"})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	url, _, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("cameraready_admin_%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload file"})
	}

	now := time.Now()

	// Update copyright record
	copyrightCol := config.GetCollection("copyrights")
	copyrightCol.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"cameraReadyUrl":        url,
			"cameraReadyFileName":   file.Filename,
			"cameraReadyUploadedAt": now,
			"cameraReadyByAdmin":    true,
			"updatedAt":             now,
		},
	})

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"message": "Camera ready paper uploaded by admin",
		"url":     url,
	})
}
