package controllers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetCommitteeMembers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("committeemembers")
	opts := options.Find().SetSort(bson.M{"order": 1, "createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching committee members"})
	}
	defer cursor.Close(ctx)

	var members []bson.M
	cursor.All(ctx, &members)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(members), "members": members})
}

func CreateCommitteeMember(c *fiber.Ctx) error {
	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	required := []string{"name", "role", "affiliation"}
	for _, field := range required {
		if _, ok := input[field]; !ok {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": field + " is required"})
		}
	}

	input["createdAt"] = time.Now()
	input["updatedAt"] = time.Now()
	if _, ok := input["active"]; !ok {
		input["active"] = true
	}
	if _, ok := input["order"]; !ok {
		input["order"] = 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("committeemembers")
	result, err := col.InsertOne(ctx, input)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error creating committee member"})
	}

	input["_id"] = result.InsertedID
	return c.Status(201).JSON(fiber.Map{"success": true, "member": input})
}

func UpdateCommitteeMember(c *fiber.Ctx) error {
	memberId := c.Params("id")
	memberObjId, err := primitive.ObjectIDFromHex(memberId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid member ID"})
	}

	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	delete(input, "_id")
	input["updatedAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("committeemembers")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": memberObjId}, bson.M{"$set": input}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Committee member not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "member": updated})
}

func DeleteCommitteeMember(c *fiber.Ctx) error {
	memberId := c.Params("id")
	memberObjId, err := primitive.ObjectIDFromHex(memberId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid member ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("committeemembers")
	result, err := col.DeleteOne(ctx, bson.M{"_id": memberObjId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Committee member not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Committee member deleted"})
}
