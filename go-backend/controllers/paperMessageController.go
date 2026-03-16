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

func GetPaperMessages(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papermessages")
	var thread bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&thread)

	return c.Status(200).JSON(fiber.Map{"success": true, "thread": thread})
}

func GetAllPaperMessagesAdmin(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papermessages")
	opts := options.Find().SetSort(bson.M{"lastMessageAt": -1})
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var threads []bson.M
	cursor.All(ctx, &threads)

	return c.Status(200).JSON(fiber.Map{"success": true, "threads": threads})
}

func SendPaperMessage(c *fiber.Ctx) error {
	var input struct {
		SubmissionId string `json:"submissionId"`
		PaperId      string `json:"paperId"`
		Message      string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	claims := c.Locals("user").(*middleware.JWTClaims)
	senderObjId, _ := primitive.ObjectIDFromHex(claims.UserID)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papermessages")

	msg := bson.M{
		"sender":     claims.Role,
		"senderId":   senderObjId,
		"senderName": claims.Username,
		"message":    input.Message,
		"timestamp":  time.Now(),
	}

	now := time.Now()
	var existing bson.M
	err := col.FindOne(ctx, bson.M{"submissionId": input.SubmissionId}).Decode(&existing)
	if err != nil {
		var paperObjId primitive.ObjectID
		if input.PaperId != "" {
			paperObjId, _ = primitive.ObjectIDFromHex(input.PaperId)
		}

		// Look up author email if not provided
		authorEmail := claims.Email
		if claims.Role != "Author" {
			papersCol := config.GetCollection("papersubmissions")
			var paper bson.M
			papersCol.FindOne(ctx, bson.M{"submissionId": input.SubmissionId}).Decode(&paper)
			if paper != nil {
				authorEmail, _ = paper["email"].(string)
			}
		}

		doc := bson.M{
			"submissionId":  input.SubmissionId,
			"paperId":       paperObjId,
			"authorEmail":   authorEmail,
			"messages":      bson.A{msg},
			"lastMessageAt": now,
			"createdAt":     now,
			"updatedAt":     now,
		}
		col.InsertOne(ctx, doc)
	} else {
		col.UpdateOne(ctx, bson.M{"submissionId": input.SubmissionId}, bson.M{
			"$push": bson.M{"messages": msg},
			"$set":  bson.M{"lastMessageAt": now, "updatedAt": now},
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent"})
}

func GetUserPaperMessages(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papermessages")
	cursor, _ := col.Find(ctx, bson.M{"authorEmail": claims.Email})
	defer cursor.Close(ctx)
	var threads []bson.M
	cursor.All(ctx, &threads)

	return c.Status(200).JSON(fiber.Map{"success": true, "threads": threads})
}
