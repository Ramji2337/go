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
	"go.mongodb.org/mongo-driver/mongo/options"
)

func SearchExistingAuthors(c *fiber.Ctx) error {
	search := c.Query("search")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	query := bson.M{"role": "Author"}
	if search != "" {
		query["$or"] = bson.A{
			bson.M{"email": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"username": bson.M{"$regex": search, "$options": "i"}},
		}
	}
	opts := options.Find().SetProjection(bson.M{"password": 0}).SetLimit(10)
	cursor, _ := col.Find(ctx, query, opts)
	defer cursor.Close(ctx)
	var authors []bson.M
	cursor.All(ctx, &authors)

	return c.Status(200).JSON(fiber.Map{"success": true, "authors": authors})
}

func AdminSubmitPaperForAuthor(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	authorEmail := c.FormValue("authorEmail")
	authorName := c.FormValue("authorName")
	paperTitle := c.FormValue("paperTitle")
	category := c.FormValue("category")
	topic := c.FormValue("topic")
	abstractText := c.FormValue("abstract")

	if authorEmail == "" || paperTitle == "" || category == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Missing required fields"})
	}

	file, err := c.FormFile("pdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "PDF file is required"})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	submissionId := utils.GenerateSubmissionId(category)

	pdfUrl, pdfPublicId, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload PDF"})
	}

	if authorName == "" {
		usersCol := config.GetCollection("users")
		var user bson.M
		usersCol.FindOne(ctx, bson.M{"email": authorEmail}).Decode(&user)
		if user != nil {
			authorName, _ = user["username"].(string)
		}
		if authorName == "" {
			authorName = authorEmail
		}
	}

	now := time.Now()
	doc := bson.M{
		"submissionId":  submissionId,
		"paperTitle":    paperTitle,
		"authorName":    authorName,
		"email":         authorEmail,
		"category":      category,
		"topic":         topic,
		"abstract":      abstractText,
		"pdfUrl":        pdfUrl,
		"pdfPublicId":   pdfPublicId,
		"pdfFileName":   file.Filename,
		"status":        "Submitted",
		"submittedBy":   claims.Email,
		"submittedByAdmin": true,
		"isMultiple":    false,
		"revisionCount": 0,
		"versions": bson.A{
			bson.M{"version": 1, "pdfUrl": pdfUrl, "pdfPublicId": pdfPublicId, "pdfFileName": file.Filename, "submittedAt": now},
		},
		"createdAt": now,
		"updatedAt": now,
	}

	col := config.GetCollection("papersubmissions")
	_, err = col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error saving submission"})
	}

	go utils.SendPaperSubmissionEmail(utils.PaperSubmissionData{
		Email: authorEmail, AuthorName: authorName, SubmissionId: submissionId, PaperTitle: paperTitle, Category: category,
	})

	return c.Status(201).JSON(fiber.Map{
		"success":      true,
		"message":      "Paper submitted on behalf of author",
		"submissionId": submissionId,
	})
}
