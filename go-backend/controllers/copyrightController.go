package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetCopyrights(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var copyrights []bson.M
	cursor.All(ctx, &copyrights)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(copyrights), "copyrights": copyrights})
}

func GetCopyrightByAuthor(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	cursor, _ := col.Find(ctx, bson.M{"authorEmail": claims.Email})
	defer cursor.Close(ctx)
	var copyrights []bson.M
	cursor.All(ctx, &copyrights)

	return c.Status(200).JSON(fiber.Map{"success": true, "copyrights": copyrights})
}

func GetCopyrightBySubmissionId(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "copyright": copyright})
}

func SubmitCopyright(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	submissionId := c.FormValue("submissionId")
	if submissionId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Submission ID is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := papersCol.FindOne(ctx, bson.M{"submissionId": submissionId, "email": claims.Email}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	var copyrightFormUrl, copyrightFormPublicId string

	file, err := c.FormFile("copyrightForm")
	if err == nil && file != nil {
		f, _ := file.Open()
		defer f.Close()
		fileBytes := make([]byte, file.Size)
		f.Read(fileBytes)

		copyrightFormUrl, copyrightFormPublicId, err = config.UploadPDF(ctx, fileBytes,
			fmt.Sprintf("copyright_%s_%s", submissionId, file.Filename))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload copyright form"})
		}
	}

	paperId, _ := paper["_id"].(primitive.ObjectID)
	now := time.Now()

	col := config.GetCollection("copyrights")
	var existing bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&existing)

	if existing != nil {
		col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
			"$set": bson.M{
				"copyrightFormUrl":      copyrightFormUrl,
				"copyrightFormPublicId": copyrightFormPublicId,
				"status":                "Submitted",
				"submittedAt":           now,
				"updatedAt":             now,
			},
		})
	} else {
		doc := bson.M{
			"paperId":               paperId,
			"submissionId":          submissionId,
			"authorEmail":           claims.Email,
			"authorName":            paper["authorName"],
			"paperTitle":            paper["paperTitle"],
			"copyrightFormUrl":      copyrightFormUrl,
			"copyrightFormPublicId": copyrightFormPublicId,
			"status":                "Submitted",
			"submittedAt":           now,
			"createdAt":             now,
			"updatedAt":             now,
		}
		col.InsertOne(ctx, doc)
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Copyright form submitted successfully"})
}

func UploadCameraReady(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	submissionId := c.FormValue("submissionId")
	if submissionId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Submission ID is required"})
	}

	file, err := c.FormFile("cameraReady")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Camera ready file is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "authorEmail": claims.Email}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright form not found"})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	url, _, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("cameraready_%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload file"})
	}

	now := time.Now()
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"cameraReadyUrl":        url,
			"cameraReadyFileName":   file.Filename,
			"cameraReadyUploadedAt": now,
			"updatedAt":             now,
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Camera ready version uploaded", "url": url})
}

func SendCopyrightMessage(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)

	var input struct {
		Message string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	senderId, _ := primitive.ObjectIDFromHex(claims.UserID)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	msg := bson.M{
		"sender":         claims.Role,
		"senderId":       senderId,
		"message":        input.Message,
		"timestamp":      time.Now(),
		"isReadByAuthor": claims.Role == "Author",
		"isReadByAdmin":  claims.Role == "Admin",
	}

	col := config.GetCollection("copyrights")
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$push": bson.M{"messages": msg},
		"$set":  bson.M{"updatedAt": time.Now()},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent"})
}

func GetCopyrightMessages(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	messages, _ := copyright["messages"].(primitive.A)
	return c.Status(200).JSON(fiber.Map{"success": true, "messages": messages})
}

func UploadFinalDoc(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	file, err := c.FormFile("finalDoc")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Final document is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	url, _, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("finaldoc_%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload file"})
	}

	now := time.Now()
	col := config.GetCollection("copyrights")
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"finalDocUrl":        url,
			"finalDocUploadedAt": now,
			"updatedAt":          now,
		},
	})

	// Update ConferenceSelectedUser too
	csCol := config.GetCollection("conferenceselectedusers")
	csCol.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"finalDocUrl":         url,
			"finalDocSubmittedAt": now,
			"updatedAt":           now,
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Final document uploaded", "url": url})
}

func ApproveCopyright(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	result, err := col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{"status": "Approved", "updatedAt": time.Now()},
	})
	if err != nil || result.MatchedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Copyright approved"})
}
