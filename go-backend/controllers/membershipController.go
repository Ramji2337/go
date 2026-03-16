package controllers

import (
	"context"
	"log"
	"strings"
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

	// Match Node.js: require membershipId exists, isAdminApproved, active, paymentStatus completed
	filter := bson.M{
		"email":           strings.ToLower(claims.Email),
		"membershipId":    bson.M{"$exists": true, "$ne": nil, "$not": bson.M{"$eq": ""}},
		"isAdminApproved": true,
		"active":          true,
		"paymentStatus":   "completed",
	}
	var membership bson.M
	err := col.FindOne(ctx, filter).Decode(&membership)

	if err != nil || membership == nil {
		return c.Status(200).JSON(fiber.Map{
			"success":        true,
			"isMember":       false,
			"membershipType": nil,
			"status":         nil,
			"membershipId":   nil,
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success":         true,
		"isMember":        true,
		"membershipType":  membership["membershipType"],
		"status":          membership["status"],
		"membershipId":    membership["membershipId"],
		"currentPosition": membership["currentPosition"],
		"experience":      membership["experience"],
		"approvedAt":      membership["approvedAt"],
	})
}

func GetRegistrationFee(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	participantType := c.Query("participantType")
	isInternational := c.Query("isInternational")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	log.Printf("Getting registration fee for: %s, %s, %s", claims.Email, participantType, isInternational)

	// Check SCIS membership
	isSCISMember := false
	var membershipData bson.M

	memCol := config.GetCollection("memberships")
	memFilter := bson.M{
		"email":           strings.ToLower(claims.Email),
		"membershipId":    bson.M{"$exists": true, "$ne": nil, "$not": bson.M{"$eq": ""}},
		"isAdminApproved": true,
		"active":          true,
		"paymentStatus":   "completed",
	}
	if err := memCol.FindOne(ctx, memFilter).Decode(&membershipData); err == nil {
		isSCISMember = true
	}

	log.Printf("Is SCIS Member: %v", isSCISMember)

	// Fee structure matching Node.js
	type feeEntry struct {
		scis    float64
		nonScis float64
	}

	indianFees := map[string]feeEntry{
		"student":  {scis: 4500, nonScis: 5850},
		"faculty":  {scis: 6750, nonScis: 7500},
		"scholar":  {scis: 6750, nonScis: 7500},
		"listener": {scis: 2500, nonScis: 3500},
	}
	foreignFees := map[string]feeEntry{
		"author":   {scis: 300, nonScis: 350},
		"listener": {scis: 100, nonScis: 150},
	}
	indonesianFees := map[string]feeEntry{
		"author":   {scis: 1700000, nonScis: 2600000},
		"listener": {scis: 1200000, nonScis: 1500000},
	}

	var fee float64
	currency := "INR"
	category := ""
	var membershipDiscount float64

	switch isInternational {
	case "indonesian":
		currency = "IDR"
		if participantType == "author" {
			entry := indonesianFees["author"]
			if isSCISMember {
				fee = entry.scis
			} else {
				fee = entry.nonScis
			}
			membershipDiscount = entry.nonScis - entry.scis
			category = "Indonesian Author"
		} else {
			entry := indonesianFees["listener"]
			if isSCISMember {
				fee = entry.scis
			} else {
				fee = entry.nonScis
			}
			membershipDiscount = entry.nonScis - entry.scis
			category = "Indonesian Listener"
		}
	case "true":
		currency = "USD"
		if participantType == "author" {
			entry := foreignFees["author"]
			if isSCISMember {
				fee = entry.scis
			} else {
				fee = entry.nonScis
			}
			membershipDiscount = entry.nonScis - entry.scis
			category = "Foreign Author"
		} else {
			entry := foreignFees["listener"]
			if isSCISMember {
				fee = entry.scis
			} else {
				fee = entry.nonScis
			}
			membershipDiscount = entry.nonScis - entry.scis
			category = "Foreign Listener"
		}
	default:
		// Indian participant
		var entry feeEntry
		switch participantType {
		case "student":
			entry = indianFees["student"]
			category = "Indian Student"
		case "faculty":
			entry = indianFees["faculty"]
			category = "Indian Faculty"
		case "scholar":
			entry = indianFees["scholar"]
			category = "Indian Research Scholar"
		default:
			entry = indianFees["listener"]
			category = "Indian Listener"
		}
		if isSCISMember {
			fee = entry.scis
		} else {
			fee = entry.nonScis
		}
		membershipDiscount = entry.nonScis - entry.scis
	}

	discount := float64(0)
	if isSCISMember {
		discount = membershipDiscount
	}

	var membershipType interface{}
	var membershipId interface{}
	if membershipData != nil {
		membershipType = membershipData["membershipType"]
		membershipId = membershipData["membershipId"]
	}

	return c.Status(200).JSON(fiber.Map{
		"success":            true,
		"fee":                fee,
		"currency":           currency,
		"category":           category,
		"isSCISMember":       isSCISMember,
		"membershipType":     membershipType,
		"membershipId":       membershipId,
		"membershipDiscount": discount,
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
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Email is required"})
	}

	log.Printf("Admin checking membership for email: %s", email)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("memberships")
	filter := bson.M{
		"email":           strings.ToLower(email),
		"membershipId":    bson.M{"$exists": true, "$ne": nil, "$not": bson.M{"$eq": ""}},
		"isAdminApproved": true,
		"active":          true,
		"paymentStatus":   "completed",
	}
	var membership bson.M
	err := col.FindOne(ctx, filter).Decode(&membership)

	isMember := err == nil && membership != nil
	log.Printf("Membership found for %s: %v", email, isMember)

	var membershipType, membershipId, status interface{}
	if membership != nil {
		membershipType = membership["membershipType"]
		membershipId = membership["membershipId"]
		status = membership["status"]
	}

	return c.Status(200).JSON(fiber.Map{
		"success":        true,
		"isMember":       isMember,
		"membershipType": membershipType,
		"membershipId":   membershipId,
		"status":         status,
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
