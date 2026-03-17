package controllers

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"go-backend/config"
	"go-backend/middleware"
)

// GetUserSubmissionDirect handles GET /user-submission (JWT required)
func GetUserSubmissionDirect(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{"email": email}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false, "message": "Error fetching submissions", "error": err.Error(),
		})
	}
	defer cursor.Close(ctx)

	var submissions []bson.M
	if err := cursor.All(ctx, &submissions); err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false, "message": "Error decoding submissions", "error": err.Error(),
		})
	}

	if len(submissions) == 0 {
		return c.Status(200).JSON(fiber.Map{
			"success": true, "hasSubmission": false, "submission": nil, "submissions": []interface{}{},
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success": true, "hasSubmission": true, "submission": submissions[0], "submissions": submissions,
	})
}

// GetRevisionStatusDirect handles GET /revision-status (JWT required)
func GetRevisionStatusDirect(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("revisions")
	cursor, err := col.Find(ctx, bson.M{"authorEmail": email})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false, "message": "Error fetching revisions", "error": err.Error(),
		})
	}
	defer cursor.Close(ctx)

	var revisions []bson.M
	if err := cursor.All(ctx, &revisions); err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false, "message": "Error decoding revisions", "error": err.Error(),
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success": true, "hasRevision": len(revisions) > 0, "revisions": revisions,
	})
}

// SubmitRevisedPaper handles POST /submit-revised-paper (JWT required)
func SubmitRevisedPaper(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	var input struct {
		SubmissionId   string `json:"submissionId"`
		AuthorResponse string `json:"authorResponse"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}
	if input.SubmissionId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Missing submissionId"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	revCol := config.GetCollection("revisions")
	var revision bson.M
	if err := revCol.FindOne(ctx, bson.M{"submissionId": input.SubmissionId, "authorEmail": email}).Decode(&revision); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Revision record not found"})
	}

	now := time.Now()
	_, err := revCol.UpdateOne(ctx, bson.M{"_id": revision["_id"]}, bson.M{
		"$set": bson.M{
			"authorResponse":         input.AuthorResponse,
			"revisedPaperSubmittedAt": now,
			"revisionStatus":         "Resubmitted",
			"updatedAt":              now,
		},
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error updating revision"})
	}

	// Update paper status
	paperCol := config.GetCollection("papersubmissions")
	paperCol.UpdateOne(ctx, bson.M{"submissionId": input.SubmissionId}, bson.M{
		"$set": bson.M{"status": "Revised Submitted", "updatedAt": now},
		"$inc": bson.M{"revisionCount": 1},
	})

	// Refetch revision
	revCol.FindOne(ctx, bson.M{"_id": revision["_id"]}).Decode(&revision)

	return c.Status(200).JSON(fiber.Map{
		"success": true, "message": "Revised paper submitted successfully", "revision": revision,
	})
}

// TestPaperFetch handles GET /test/paperfetch
func TestPaperFetch(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching papers", "error": err.Error()})
	}
	defer cursor.Close(ctx)

	var papers []bson.M
	if err := cursor.All(ctx, &papers); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error decoding papers", "error": err.Error()})
	}

	log.Printf("Found %d papers in database", len(papers))

	return c.Status(200).JSON(fiber.Map{
		"success": true, "count": len(papers), "papers": papers,
	})
}

// TestPdfFetch handles GET /test/pdf-fetch
func TestPdfFetch(c *fiber.Ctx) error {
	urlParam := c.Query("url")
	publicId := c.Query("publicId")

	if urlParam == "" && publicId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "PDF URL or publicId required"})
	}

	pdfURL := urlParam
	if publicId != "" {
		cloudName := os.Getenv("CLOUDINARY_CLOUD_NAME")
		if cloudName != "" {
			publicIdClean := strings.TrimSuffix(publicId, ".pdf")
			pdfURL = fmt.Sprintf("https://res.cloudinary.com/%s/raw/upload/%s.pdf", cloudName, publicIdClean)
		}
	}

	if pdfURL == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Could not construct PDF URL"})
	}

	log.Printf("Fetching Cloudinary PDF: %s", pdfURL)

	resp, err := http.Get(pdfURL) // #nosec G107 -- URL constructed from trusted CLOUDINARY_CLOUD_NAME env var
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching PDF", "error": err.Error()})
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"success": false, "message": fmt.Sprintf("Failed to fetch PDF: %s", resp.Status),
			"status": resp.StatusCode, "url": pdfURL,
		})
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/pdf"
	}
	c.Set("Content-Type", contentType)
	c.Set("Cache-Control", "public, max-age=3600")
	c.Set("Accept-Ranges", "bytes")
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		c.Set("Content-Length", cl)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error reading PDF response"})
	}
	return c.Send(body)
}

// TestCloudinaryPdf handles GET /test/cloudinary-pdf
func TestCloudinaryPdf(c *fiber.Ctx) error {
	publicId := c.Query("publicId")
	if publicId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Cloudinary public ID required"})
	}

	cloudName := os.Getenv("CLOUDINARY_CLOUD_NAME")
	pdfURL := fmt.Sprintf("https://res.cloudinary.com/%s/fl_attachment/v1/%s", cloudName, publicId)

	resp, err := http.Get(pdfURL) // #nosec G107 -- URL constructed from trusted CLOUDINARY_CLOUD_NAME env var
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching Cloudinary PDF", "error": err.Error()})
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"success": false, "message": "Failed to fetch PDF from Cloudinary", "status": resp.StatusCode,
		})
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/pdf"
	}
	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", `inline; filename="paper.pdf"`)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error reading PDF response"})
	}
	return c.Send(body)
}
