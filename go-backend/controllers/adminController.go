package controllers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func CreateEditor(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if input.Email == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Email is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	var existing bson.M
	if err := col.FindOne(ctx, bson.M{"email": input.Email}).Decode(&existing); err == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "User with this email already exists"})
	}

	password := input.Password
	if password == "" {
		password = utils.GenerateRandomPassword()
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), 10)

	username := input.Username
	if username == "" {
		for i, ch := range input.Email {
			if ch == '@' {
				username = input.Email[:i]
				break
			}
		}
	}

	doc := bson.M{
		"username":     username,
		"email":        input.Email,
		"password":     string(hash),
		"tempPassword": password,
		"role":         "Editor",
		"verified":     true,
		"createdAt":    time.Now(),
	}

	result, err := col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error creating editor"})
	}

	go func() {
		loginURL := fmt.Sprintf("%s/login", utils.FrontendURL())
		if err := utils.SendEditorCredentialsEmail(input.Email, username, password); err != nil {
			log.Printf("Failed to send editor credentials email: %v", err)
		}
		_ = loginURL
	}()

	return c.Status(201).JSON(fiber.Map{
		"success": true,
		"message": "Editor account created successfully",
		"editor": fiber.Map{
			"_id":      result.InsertedID,
			"email":    input.Email,
			"username": username,
			"role":     "Editor",
		},
	})
}

func GetAllEditors(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	opts := options.Find().SetProjection(bson.M{"password": 0}).SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{"role": "Editor"}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching editors"})
	}
	defer cursor.Close(ctx)

	var editors []bson.M
	cursor.All(ctx, &editors)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(editors), "editors": editors})
}

func ReassignEditor(c *fiber.Ctx) error {
	var input struct {
		PaperId     string `json:"paperId"`
		NewEditorId string `json:"newEditorId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	paperObjId, err := primitive.ObjectIDFromHex(input.PaperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}
	editorObjId, err := primitive.ObjectIDFromHex(input.NewEditorId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid editor ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	result, err := col.UpdateOne(ctx, bson.M{"_id": paperObjId}, bson.M{
		"$set": bson.M{"assignedEditor": editorObjId, "updatedAt": time.Now()},
	})
	if err != nil || result.MatchedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Editor reassigned successfully"})
}

func GetAllUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	search := c.Query("search")
	role := c.Query("role")

	query := bson.M{}
	if role != "" {
		query["role"] = role
	}
	if search != "" {
		query["$or"] = bson.A{
			bson.M{"email": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"username": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	col := config.GetCollection("users")
	opts := options.Find().SetProjection(bson.M{"password": 0}).SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, query, opts)
	defer cursor.Close(ctx)

	var users []bson.M
	cursor.All(ctx, &users)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(users), "users": users})
}

func GetDashboardStats(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	usersCol := config.GetCollection("users")
	papersCol := config.GetCollection("papersubmissions")
	reviewersCol := config.GetCollection("users")
	editorsCol := config.GetCollection("users")

	totalUsers, _ := usersCol.CountDocuments(ctx, bson.M{})
	totalPapers, _ := papersCol.CountDocuments(ctx, bson.M{})
	totalReviewers, _ := reviewersCol.CountDocuments(ctx, bson.M{"role": "Reviewer"})
	totalEditors, _ := editorsCol.CountDocuments(ctx, bson.M{"role": "Editor"})
	totalAccepted, _ := papersCol.CountDocuments(ctx, bson.M{"status": "Accepted"})
	totalRejected, _ := papersCol.CountDocuments(ctx, bson.M{"status": "Rejected"})
	underReview, _ := papersCol.CountDocuments(ctx, bson.M{"status": "Under Review"})

	// Papers by status
	pipeline := []bson.M{
		{"$group": bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}},
	}
	cursor, _ := papersCol.Aggregate(ctx, pipeline)
	var papersByStatus []bson.M
	cursor.All(ctx, &papersByStatus)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"stats": fiber.Map{
			"totalUsers":     totalUsers,
			"totalPapers":    totalPapers,
			"totalReviewers": totalReviewers,
			"totalEditors":   totalEditors,
			"totalAccepted":  totalAccepted,
			"totalRejected":  totalRejected,
			"underReview":    underReview,
			"papersByStatus": papersByStatus,
		},
	})
}

func DeleteUser(c *fiber.Ctx) error {
	userId := c.Params("userId")
	objId, err := primitive.ObjectIDFromHex(userId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid user ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("users")
	result, err := col.DeleteOne(ctx, bson.M{"_id": objId})
	if err != nil || result.DeletedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "User not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "User deleted successfully"})
}

func SendMessageToEditor(c *fiber.Ctx) error {
	var input struct {
		EditorEmail string `json:"editorEmail"`
		EditorName  string `json:"editorName"`
		Message     string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if err := utils.SendEditorMessageEmail(input.EditorEmail, input.EditorName, input.Message); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending email"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent to editor"})
}

func GetConferenceSelectedUsers(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("conferenceselectedusers")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching selected users"})
	}
	defer cursor.Close(ctx)

	var users []bson.M
	cursor.All(ctx, &users)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(users), "selectedUsers": users})
}

func GetAllPdfsAdmin(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetProjection(bson.M{
		"submissionId": 1, "paperTitle": 1, "authorName": 1, "email": 1,
		"pdfUrl": 1, "pdfFileName": 1, "status": 1, "category": 1,
	})
	cursor, _ := col.Find(ctx, bson.M{"pdfUrl": bson.M{"$exists": true, "$ne": ""}}, opts)
	defer cursor.Close(ctx)

	var pdfs []bson.M
	cursor.All(ctx, &pdfs)

	return c.Status(200).JSON(fiber.Map{"success": true, "pdfs": pdfs})
}

func DeletePdfAdmin(c *fiber.Ctx) error {
	var input struct {
		PublicId     string `json:"publicId"`
		SubmissionId string `json:"submissionId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if input.PublicId != "" {
		config.DeletePDF(ctx, input.PublicId)
	}

	if input.SubmissionId != "" {
		col := config.GetCollection("papersubmissions")
		col.UpdateOne(ctx, bson.M{"submissionId": input.SubmissionId}, bson.M{
			"$set": bson.M{"pdfUrl": "", "pdfPublicId": ""},
		})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "PDF deleted"})
}

func SendSelectedUserEmail(c *fiber.Ctx) error {
	var input struct {
		Email       string `json:"email"`
		Name        string `json:"name"`
		PaperTitle  string `json:"paperTitle"`
		SubmissionId string `json:"submissionId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if err := utils.SendSelectionEmail(input.Email, input.Name, map[string]interface{}{
		"submissionId": input.SubmissionId,
		"paperTitle":   input.PaperTitle,
	}); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error sending email"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Selection email sent"})
}
