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

func CheckMembership(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("memberships")
	var membership bson.M
	col.FindOne(ctx, bson.M{"email": claims.Email}).Decode(&membership)

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"hasMembership": membership != nil,
		"membership":   membership,
	})
}

func GetRegistrationFee(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Check if user has accepted paper
	faCol := config.GetCollection("finalacceptances")
	var acceptance bson.M
	faCol.FindOne(ctx, bson.M{"authorEmail": claims.Email}).Decode(&acceptance)

	if acceptance == nil {
		return c.Status(200).JSON(fiber.Map{
			"success": true,
			"fee": fiber.Map{
				"amount":   "Please contact admin",
				"currency": "USD",
			},
		})
	}

	// Check membership
	memCol := config.GetCollection("memberships")
	var membership bson.M
	memCol.FindOne(ctx, bson.M{"email": claims.Email, "active": true}).Decode(&membership)

	fee := 300.0
	if membership != nil {
		fee = 250.0
	}

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"fee": fiber.Map{
			"amount":        fee,
			"currency":      "USD",
			"hasMembership": membership != nil,
			"discount":      membership != nil,
		},
	})
}

func CheckUserMembership(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	email := input.Email
	if email == "" {
		claims := c.Locals("user").(*middleware.JWTClaims)
		email = claims.Email
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("memberships")
	var membership bson.M
	col.FindOne(ctx, bson.M{"email": email}).Decode(&membership)

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"hasMembership": membership != nil,
		"membership":   membership,
	})
}

func SubmitListenerRegistration(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	var input bson.M
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	input["userEmail"] = claims.Email
	input["username"] = claims.Username
	input["status"] = "pending"
	input["createdAt"] = time.Now()
	input["updatedAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("listenerregistrations")

	// Check if already registered
	var existing bson.M
	if err := col.FindOne(ctx, bson.M{"userEmail": claims.Email}).Decode(&existing); err == nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"message": "You have already submitted a listener registration",
			"registration": existing,
		})
	}

	result, err := col.InsertOne(ctx, input)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error submitting registration"})
	}

	input["_id"] = result.InsertedID
	return c.Status(201).JSON(fiber.Map{
		"success":      true,
		"message":      "Listener registration submitted",
		"registration": input,
	})
}

func GetMyListenerRegistration(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("listenerregistrations")
	var registration bson.M
	col.FindOne(ctx, bson.M{"userEmail": claims.Email}).Decode(&registration)

	return c.Status(200).JSON(fiber.Map{
		"success":      true,
		"registration": registration,
	})
}

func GetAllListeners(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("listenerregistrations")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var registrations []bson.M
	cursor.All(ctx, &registrations)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(registrations), "registrations": registrations})
}

func GetPendingListeners(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("listenerregistrations")
	cursor, _ := col.Find(ctx, bson.M{"status": "pending"})
	defer cursor.Close(ctx)
	var registrations []bson.M
	cursor.All(ctx, &registrations)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(registrations), "registrations": registrations})
}

func VerifyListener(c *fiber.Ctx) error {
	id := c.Params("id")
	objId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("listenerregistrations")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": objId}, bson.M{
		"$set": bson.M{"status": "verified", "verifiedAt": time.Now(), "updatedAt": time.Now()},
	}, opts).Decode(&updated); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Registration not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Listener verified", "registration": updated})
}

func RejectListener(c *fiber.Ctx) error {
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

	col := config.GetCollection("listenerregistrations")
	col.UpdateOne(ctx, bson.M{"_id": objId}, bson.M{
		"$set": bson.M{"status": "rejected", "rejectionReason": input.Reason, "rejectedAt": time.Now(), "updatedAt": time.Now()},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Listener rejected"})
}
