package middleware

import (
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ValidateFileUpload checks file type, size, and extension for safety.
// Returns (isValid, errors).
func ValidateFileUpload(file *multipart.FileHeader, allowedTypes []string, maxSize int64) (bool, []string) {
	var errors []string

	// Check file type (Content-Type header)
	contentType := file.Header.Get("Content-Type")
	typeAllowed := false
	for _, t := range allowedTypes {
		if contentType == t {
			typeAllowed = true
			break
		}
	}
	if !typeAllowed {
		errors = append(errors, fmt.Sprintf("Invalid file type. Allowed types: %s", strings.Join(allowedTypes, ", ")))
	}

	// Check file size
	if file.Size > maxSize {
		errors = append(errors, fmt.Sprintf("File too large. Maximum size: %dMB", maxSize/(1024*1024)))
	}

	// Check for dangerous extensions
	dangerousExtensions := []string{".exe", ".bat", ".cmd", ".sh", ".php", ".js", ".html"}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	for _, dangerousExt := range dangerousExtensions {
		if ext == dangerousExt {
			errors = append(errors, "Dangerous file extension detected")
			break
		}
	}

	return len(errors) == 0, errors
}

// UploadPaperPDF validates that an uploaded file is a PDF and ≤ 10MB.
func UploadPaperPDF(fieldName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		file, err := c.FormFile(fieldName)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "No file uploaded"})
		}
		valid, errs := ValidateFileUpload(file, []string{"application/pdf"}, 10*1024*1024)
		if !valid {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid file", "errors": errs})
		}
		return c.Next()
	}
}

// UploadReviewFile validates documents (PDF, DOC, DOCX) ≤ 5MB.
func UploadReviewFile(fieldName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		file, err := c.FormFile(fieldName)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "No file uploaded"})
		}
		allowedTypes := []string{
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		}
		valid, errs := ValidateFileUpload(file, allowedTypes, 5*1024*1024)
		if !valid {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid file", "errors": errs})
		}
		return c.Next()
	}
}

// UploadFinalDocument validates final documents (PDF, DOC, DOCX) ≤ 15MB.
func UploadFinalDocument(fieldName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		file, err := c.FormFile(fieldName)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "No file uploaded"})
		}
		allowedTypes := []string{
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		}
		valid, errs := ValidateFileUpload(file, allowedTypes, 15*1024*1024)
		if !valid {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid file", "errors": errs})
		}
		return c.Next()
	}
}

// UploadImage validates images (JPEG, PNG, WebP) ≤ 5MB.
func UploadImage(fieldName string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		file, err := c.FormFile(fieldName)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "No file uploaded"})
		}
		allowedTypes := []string{"image/jpeg", "image/png", "image/webp"}
		valid, errs := ValidateFileUpload(file, allowedTypes, 5*1024*1024)
		if !valid {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid file", "errors": errs})
		}
		return c.Next()
	}
}
