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

func GetMySupportMessages(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	authorId := claims.UserID
	authorEmail := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("supportmessages")
	var supportThread bson.M
	err := col.FindOne(ctx, bson.M{"authorId": authorId}).Decode(&supportThread)

	if err != nil {
		// Thread not found, create one
		usersCol := config.GetCollection("users")
		authorObjId, _ := primitive.ObjectIDFromHex(authorId)
		var user bson.M
		usersCol.FindOne(ctx, bson.M{"_id": authorObjId}).Decode(&user)

		authorName := authorEmail
		if user != nil {
			if uname, ok := user["username"].(string); ok && uname != "" {
				authorName = uname
			}
		}

		newThread := bson.M{
			"authorId":    authorId,
			"authorEmail": authorEmail,
			"authorName":  authorName,
			"messages":    bson.A{},
			"createdAt":   time.Now(),
			"updatedAt":   time.Now(),
		}
		result, insertErr := col.InsertOne(ctx, newThread)
		if insertErr != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error creating support thread"})
		}
		newThread["_id"] = result.InsertedID
		return c.Status(200).JSON(fiber.Map{
			"success":     true,
			"data":        newThread,
			"unreadCount": 0,
		})
	}

	// Mark admin messages as read by author
	modified := false
	if msgs, ok := supportThread["messages"].(bson.A); ok {
		for i, m := range msgs {
			if msg, ok := m.(bson.M); ok {
				sender, _ := msg["sender"].(string)
				isRead, _ := msg["isReadByAuthor"].(bool)
				if sender == "Admin" && !isRead {
					msg["isReadByAuthor"] = true
					msgs[i] = msg
					modified = true
				}
			}
		}
		if modified {
			col.UpdateOne(ctx, bson.M{"_id": supportThread["_id"]}, bson.M{"$set": bson.M{"messages": msgs}})
			supportThread["messages"] = msgs
		}
	}

	// Count unread
	unreadCount := 0
	if msgs, ok := supportThread["messages"].(bson.A); ok {
		for _, m := range msgs {
			if msg, ok := m.(bson.M); ok {
				sender, _ := msg["sender"].(string)
				isRead, _ := msg["isReadByAuthor"].(bool)
				if sender == "Admin" && !isRead {
					unreadCount++
				}
			}
		}
	}

	return c.Status(200).JSON(fiber.Map{
		"success":     true,
		"data":        supportThread,
		"unreadCount": unreadCount,
	})
}

func GetAllSupportThreads(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("supportmessages")
	opts := options.Find().SetSort(bson.M{"lastMessageAt": -1})
	cursor, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching messages"})
	}
	defer cursor.Close(ctx)

	var threads []bson.M
	cursor.All(ctx, &threads)

	totalUnread := 0
	for i, t := range threads {
		unreadCount := 0
		if msgs, ok := t["messages"].(bson.A); ok {
			for _, m := range msgs {
				if msg, ok := m.(bson.M); ok {
					sender, _ := msg["sender"].(string)
					isRead, _ := msg["isReadByAdmin"].(bool)
					if sender == "Author" && !isRead {
						unreadCount++
					}
				}
			}
		}
		threads[i]["unreadCount"] = unreadCount
		totalUnread += unreadCount
	}

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"count":        len(threads),
		"data":         threads,
		"totalUnread":  totalUnread,
	})
}
