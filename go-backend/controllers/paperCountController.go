package controllers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func GetPaperCountPublic(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	total, _ := col.CountDocuments(ctx, bson.M{})

	return c.Status(200).JSON(fiber.Map{"success": true, "count": total})
}

func GetPublicAcceptedPapers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("finalacceptances")
	cursor, _ := col.Find(ctx, bson.M{"status": "accepted"},
		nil)
	defer cursor.Close(ctx)
	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func GetPublicCommitteeMembers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("committeemembers")
	cursor, _ := col.Find(ctx, bson.M{"active": true})
	defer cursor.Close(ctx)
	var members []bson.M
	cursor.All(ctx, &members)

	return c.Status(200).JSON(fiber.Map{"success": true, "members": members})
}

func GetConferenceSelectedUsersPublic(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("conferenceselectedusers")
	cursor, _ := col.Find(ctx, bson.M{})
	defer cursor.Close(ctx)
	var users []bson.M
	cursor.All(ctx, &users)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(users), "selectedUsers": users})
}

func AddConferenceSelectedUser(c *fiber.Ctx) error {
	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	input["createdAt"] = time.Now()
	input["updatedAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("conferenceselectedusers")
	result, err := col.InsertOne(ctx, input)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error adding user"})
	}

	input["_id"] = result.InsertedID
	return c.Status(201).JSON(fiber.Map{"success": true, "user": input})
}

func RemoveConferenceSelectedUser(c *fiber.Ctx) error {
	id := c.Params("id")
	objId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("conferenceselectedusers")
	result, err := col.DeleteOne(ctx, bson.M{"_id": objId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "User removed"})
}

func GetPaymentDoneUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("paymentdonefinalusers")
	cursor, _ := col.Find(ctx, bson.M{})
	defer cursor.Close(ctx)
	var users []bson.M
	cursor.All(ctx, &users)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(users), "users": users})
}
