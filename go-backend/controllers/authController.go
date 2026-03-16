package controllers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"github.com/golang-jwt/jwt/v5"
)

func Register(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Country  string `json:"country"`
		UserType string `json:"userType"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	if input.Role == "" {
		input.Role = "Author"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")

	var existing bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&existing); err == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "User already exists"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 10)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error hashing password"})
	}

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	verificationToken := hex.EncodeToString(tokenBytes)
	verificationExpires := time.Now().Add(48 * time.Hour)

	username := input.Email
	if atIdx := len(input.Email); atIdx > 0 {
		for i, ch := range input.Email {
			if ch == '@' {
				username = input.Email[:i]
				break
			}
		}
	}

	doc := bson.M{
		"username":            username,
		"email":               input.Email,
		"password":            string(hash),
		"role":                input.Role,
		"isGoogleAuth":        false,
		"verified":            false,
		"verificationToken":   verificationToken,
		"verificationExpires": verificationExpires,
		"createdAt":           time.Now(),
	}
	if input.Country != "" {
		doc["country"] = input.Country
	}
	if input.UserType != "" {
		doc["userType"] = input.UserType
	}

	_, err = col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error creating user"})
	}

	go func() {
		if err := utils.SendVerificationEmail(input.Email, verificationToken); err != nil {
			log.Printf("Failed to send verification email: %v", err)
		}
	}()

	return c.Status(201).JSON(fiber.Map{
		"success": true,
		"message": "Account created. Please check your email to verify your account.",
	})
}

func Login(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	if input.Email == "" || input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Email and password are required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var user bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&user); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "User does not exist"})
	}

	storedPass, _ := user["password"].(string)
	if storedPass == "" {
		isGoogle, _ := user["isGoogleAuth"].(bool)
		if isGoogle {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "This account was created with Google. Please use Google Login."})
		}
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "No password set for this account. Please contact support."})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedPass), []byte(input.Password)); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Incorrect password"})
	}

	verified, _ := user["verified"].(bool)
	if !verified {
		return c.Status(200).JSON(fiber.Map{
			"success":          false,
			"verified":         false,
			"needsVerification": true,
			"message":          "Please verify your email before logging in",
		})
	}

	userID := user["_id"].(primitive.ObjectID).Hex()
	username, _ := user["username"].(string)
	role, _ := user["role"].(string)
	country, _ := user["country"].(string)

	claims := middleware.JWTClaims{
		Email:    input.Email,
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error generating token"})
	}

	isProduction := os.Getenv("NODE_ENV") == "production"
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    signed,
		HTTPOnly: true,
		Secure:   isProduction,
		SameSite: "Strict",
		MaxAge:   24 * 60 * 60,
	})
	c.Cookie(&fiber.Cookie{
		Name:     "role",
		Value:    role,
		HTTPOnly: false,
		Secure:   isProduction,
		SameSite: "Strict",
		MaxAge:   24 * 60 * 60,
	})

	return c.Status(200).JSON(fiber.Map{
		"success":  true,
		"verified": true,
		"token":    signed,
		"email":    input.Email,
		"username": username,
		"role":     role,
		"country":  country,
		"user": fiber.Map{
			"email":    input.Email,
			"username": username,
			"role":     role,
			"country":  country,
		},
	})
}

func Logout(c *fiber.Ctx) error {
	c.ClearCookie("token")
	c.ClearCookie("role")
	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Logged out successfully"})
}

func VerifyEmail(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		var body struct {
			Token string `json:"token"`
		}
		c.BodyParser(&body)
		token = body.Token
	}

	if token == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Verification token is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	filter := bson.M{
		"verificationToken":   token,
		"verificationExpires": bson.M{"$gt": time.Now()},
	}

	emailParam := c.Query("email")
	if emailParam == "" {
		var body struct{ Email string `json:"email"` }
		c.BodyParser(&body)
		emailParam = body.Email
	}
	if emailParam != "" {
		filter["email"] = emailParam
	}

	update := bson.M{
		"$set":   bson.M{"verified": true},
		"$unset": bson.M{"verificationToken": "", "verificationExpires": ""},
	}

	result, err := col.UpdateOne(ctx, filter, update)
	if err != nil || result.MatchedCount == 0 {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or expired verification token. Please request a new verification email.",
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Email verified successfully. You can now log in."})
}

func ResendVerification(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var user bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&user); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	verified, _ := user["verified"].(bool)
	if verified {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Email already verified"})
	}

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	verificationToken := hex.EncodeToString(tokenBytes)

	_, err := col.UpdateOne(ctx, bson.M{"email": input.Email}, bson.M{
		"$set": bson.M{
			"verificationToken":   verificationToken,
			"verificationExpires": time.Now().Add(48 * time.Hour),
		},
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error updating token"})
	}

	if err := utils.SendVerificationEmail(input.Email, verificationToken); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending email"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Verification email sent. Please check your inbox."})
}

func ForgotPassword(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var user bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&user); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	otp := fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	otpExpiry := time.Now().Add(10 * time.Minute)

	col.UpdateOne(ctx, bson.M{"email": input.Email}, bson.M{
		"$set": bson.M{
			"resetPasswordOTP":    otp,
			"resetPasswordExpiry": otpExpiry,
		},
	})

	if err := utils.SendOTPEmail(input.Email, otp); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending OTP email"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "OTP sent to your email"})
}

func ResetPassword(c *fiber.Ctx) error {
	var input struct {
		Email       string `json:"email"`
		OTP         string `json:"otp"`
		NewPassword string `json:"newPassword"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var user bson.M
	if err := col.FindOne(ctx, bson.M{
		"email":               input.Email,
		"resetPasswordOTP":    input.OTP,
		"resetPasswordExpiry": bson.M{"$gt": time.Now()},
	}).Decode(&user); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid or expired OTP"})
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(input.NewPassword), 10)
	col.UpdateOne(ctx, bson.M{"email": input.Email}, bson.M{
		"$set":   bson.M{"password": string(hash)},
		"$unset": bson.M{"resetPasswordOTP": "", "resetPasswordExpiry": ""},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Password reset successful"})
}

func GetCurrentUser(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	userID, err := primitive.ObjectIDFromHex(claims.UserID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid user ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var user bson.M
	opts := options.FindOne().SetProjection(bson.M{"password": 0})
	if err := col.FindOne(ctx, bson.M{"_id": userID}, opts).Decode(&user); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "user": user})
}

func CheckAcceptanceStatus(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "isAccepted": false, "message": "Email is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	opts := options.FindOne().SetSort(bson.M{"updatedAt": -1})
	if err := col.FindOne(ctx, bson.M{"email": email, "status": "Accepted"}, opts).Decode(&paper); err != nil {
		return c.Status(200).JSON(fiber.Map{
			"success":    true,
			"isAccepted": false,
			"message":    "User does not have an accepted paper",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success":    true,
		"isAccepted": true,
		"message":    "User has an accepted paper",
		"acceptanceData": fiber.Map{
			"paperTitle":   paper["paperTitle"],
			"authorName":   paper["authorName"],
			"submissionId": paper["submissionId"],
		},
	})
}

func UpdateUserCountry(c *fiber.Ctx) error {
	var input struct {
		Country string `json:"country"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if input.Country == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Country is required"})
	}

	claims := c.Locals("user").(*middleware.JWTClaims)
	userID, err := primitive.ObjectIDFromHex(claims.UserID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid user ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"password": 0})
	var user bson.M
	if err := col.FindOneAndUpdate(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"country": input.Country}}, opts).Decode(&user); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"message": "Country updated successfully",
		"user": fiber.Map{
			"email":    user["email"],
			"username": user["username"],
			"role":     user["role"],
			"country":  user["country"],
		},
	})
}
