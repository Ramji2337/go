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

func SubmitSupportMessage(c *fiber.Ctx) error {
	var input struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Subject string `json:"subject"`
		Message string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if input.Email == "" || input.Message == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Email and message are required"})
	}

	// Fill name from JWT if present
	if user, ok := c.Locals("user").(*middleware.JWTClaims); ok && user != nil {
		if input.Email == "" {
			input.Email = user.Email
		}
		if input.Name == "" {
			input.Name = user.Username
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("supportmessages")
	doc := bson.M{
		"name":      input.Name,
		"email":     input.Email,
		"subject":   input.Subject,
		"message":   input.Message,
		"status":    "open",
		"createdAt": time.Now(),
		"updatedAt": time.Now(),
	}
	result, err := col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error submitting message"})
	}

	doc["_id"] = result.InsertedID
	return c.Status(201).JSON(fiber.Map{
		"success": true,
		"message": "Message sent successfully",
		"data":    doc,
	})
}

func GetSupportMessages(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	status := c.Query("status")
	query := bson.M{}
	if status != "" {
		query["status"] = status
	}

	col := config.GetCollection("supportmessages")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, query, opts)
	defer cursor.Close(ctx)
	var messages []bson.M
	cursor.All(ctx, &messages)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(messages), "messages": messages})
}

func UpdateSupportMessageStatus(c *fiber.Ctx) error {
	messageId := c.Params("id")
	messageObjId, err := primitive.ObjectIDFromHex(messageId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid message ID"})
	}

	var input struct {
		Status   string `json:"status"`
		Response string `json:"response"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	update := bson.M{"updatedAt": time.Now()}
	if input.Status != "" {
		update["status"] = input.Status
	}
	if input.Response != "" {
		update["response"] = input.Response
		update["respondedAt"] = time.Now()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("supportmessages")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": messageObjId}, bson.M{"$set": update}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Message not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Status updated", "data": updated})
}

func DeleteSupportMessage(c *fiber.Ctx) error {
	messageId := c.Params("id")
	messageObjId, err := primitive.ObjectIDFromHex(messageId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid message ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("supportmessages")
	result, err := col.DeleteOne(ctx, bson.M{"_id": messageObjId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Message not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message deleted"})
}
