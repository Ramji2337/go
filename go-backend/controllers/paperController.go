package controllers

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go-backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func SubmitPaper(c *fiber.Ctx) error {
	log.Println("Received paper submission request")

	var email, paperTitle, authorName, category, topic, abstractText string

	email = c.FormValue("email")
	paperTitle = c.FormValue("paperTitle")
	authorName = c.FormValue("authorName")
	category = c.FormValue("category")
	topic = c.FormValue("topic")
	abstractText = c.FormValue("abstract")

	if email == "" {
		if user, ok := c.Locals("user").(*middleware.JWTClaims); ok && user != nil {
			email = user.Email
		}
	}

	if paperTitle == "" || authorName == "" || email == "" || category == "" {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"message": "Missing required fields: paperTitle, authorName, email, category",
		})
	}

	file, err := c.FormFile("pdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "PDF file is required"})
	}

	submissionId := utils.GenerateSubmissionId(category)
	bookingId := utils.GenerateBookingId()

	var pdfUrl, pdfPublicId, pdfFileName string
	pdfFileName = file.Filename

	f, err := file.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error reading uploaded file"})
	}
	defer f.Close()

	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pdfUrl, pdfPublicId, err = config.UploadPDF(ctx, fileBytes, fmt.Sprintf("%s_%s", submissionId, pdfFileName))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload PDF: " + err.Error()})
	}

	now := time.Now()
	doc := bson.M{
		"submissionId": submissionId,
		"paperTitle":   paperTitle,
		"authorName":   authorName,
		"email":        email,
		"category":     category,
		"topic":        topic,
		"abstract":     abstractText,
		"pdfUrl":       pdfUrl,
		"pdfPublicId":  pdfPublicId,
		"pdfFileName":  pdfFileName,
		"status":       "Submitted",
		"isMultiple":   false,
		"revisionCount": 0,
		"versions": bson.A{
			bson.M{
				"version":     1,
				"pdfUrl":      pdfUrl,
				"pdfPublicId": pdfPublicId,
				"pdfFileName": pdfFileName,
				"submittedAt": now,
			},
		},
		"createdAt": now,
		"updatedAt": now,
	}

	col := config.GetCollection("papersubmissions")
	_, err = col.InsertOne(ctx, doc)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error saving submission"})
	}

	go func() {
		utils.SendPaperSubmissionEmail(utils.PaperSubmissionData{
			Email:        email,
			AuthorName:   authorName,
			SubmissionId: submissionId,
			PaperTitle:   paperTitle,
			Category:     category,
		})
		utils.SendAdminNotificationEmail(utils.PaperSubmissionData{
			Email:        email,
			AuthorName:   authorName,
			SubmissionId: submissionId,
			PaperTitle:   paperTitle,
			Category:     category,
		})
	}()

	return c.Status(201).JSON(fiber.Map{
		"success":      true,
		"message":      "Paper submitted successfully",
		"submissionId": submissionId,
		"bookingId":    bookingId,
		"paperDetails": fiber.Map{
			"title":    paperTitle,
			"category": category,
			"status":   "Submitted",
			"fileName": pdfFileName,
		},
	})
}

func SubmitMultiplePaper(c *fiber.Ctx) error {
	log.Println("Multiple paper submission")

	var email, paperTitle, authorName, category, topic, abstractText string
	email = c.FormValue("email")
	paperTitle = c.FormValue("paperTitle")
	authorName = c.FormValue("authorName")
	category = c.FormValue("category")
	topic = c.FormValue("topic")
	abstractText = c.FormValue("abstract")

	if email == "" {
		if user, ok := c.Locals("user").(*middleware.JWTClaims); ok && user != nil {
			email = user.Email
		}
	}

	if paperTitle == "" || authorName == "" || email == "" || category == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Missing required fields"})
	}

	file, err := c.FormFile("pdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "PDF file is required"})
	}

	f, err := file.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error reading file"})
	}
	defer f.Close()

	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	submissionId := utils.GenerateSubmissionId(category)
	bookingId := utils.GenerateBookingId()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pdfUrl, pdfPublicId, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload PDF"})
	}

	now := time.Now()
	doc := bson.M{
		"submissionId": submissionId,
		"paperTitle":   paperTitle,
		"authorName":   authorName,
		"email":        email,
		"category":     category,
		"topic":        topic,
		"abstract":     abstractText,
		"pdfUrl":       pdfUrl,
		"pdfPublicId":  pdfPublicId,
		"pdfFileName":  file.Filename,
		"status":       "Submitted",
		"isMultiple":   true,
		"revisionCount": 0,
		"versions": bson.A{
			bson.M{"version": 1, "pdfUrl": pdfUrl, "pdfPublicId": pdfPublicId, "pdfFileName": file.Filename, "submittedAt": now},
		},
		"createdAt": now,
		"updatedAt": now,
	}

	col := config.GetCollection("papersubmissions")
	col.InsertOne(ctx, doc)

	go utils.SendPaperSubmissionEmail(utils.PaperSubmissionData{
		Email: email, AuthorName: authorName, SubmissionId: submissionId, PaperTitle: paperTitle, Category: category,
	})

	utils.EmitToAdmins("paper:new_submission", fiber.Map{
		"submissionId": submissionId, "paperTitle": paperTitle, "authorName": authorName, "category": category,
	})

	return c.Status(201).JSON(fiber.Map{
		"success": true, "message": "Additional paper submitted successfully",
		"submissionId": submissionId, "bookingId": bookingId,
		"paperDetails": fiber.Map{"title": paperTitle, "category": category, "status": "Submitted", "fileName": file.Filename},
	})
}

func GetUserSubmission(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	filter := bson.M{"email": bson.M{"$regex": "^" + regexp.QuoteMeta(email) + "$", "$options": "i"}}
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching submissions"})
	}
	defer cursor.Close(ctx)

	var submissions []bson.M
	cursor.All(ctx, &submissions)

	// Check for payment
	payCol := config.GetCollection("paymentdonefinalusers")
	var payment bson.M
	payCol.FindOne(ctx, bson.M{"authorEmail": email}).Decode(&payment)
	isPaid := payment != nil

	subs := make([]fiber.Map, 0, len(submissions))
	for _, s := range submissions {
		m := fiber.Map{}
		for k, v := range s {
			m[k] = v
		}
		m["isPaid"] = isPaid
		subs = append(subs, m)
	}

	var primarySub interface{}
	if len(subs) > 0 {
		primarySub = subs[0]
	}

	return c.Status(200).JSON(fiber.Map{
		"success":       true,
		"hasSubmission": len(subs) > 0,
		"submission":    primarySub,
		"submissions":   subs,
	})
}

func GetPaperStatus(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var submission bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&submission); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Submission not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "submission": submission})
}

func EditSubmission(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var existing bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "email": email}).Decode(&existing); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Submission not found or you don't have permission to edit it"})
	}

	setFields := bson.M{"updatedAt": time.Now()}
	var body struct {
		PaperTitle string `json:"paperTitle"`
		Category   string `json:"category"`
		Topic      string `json:"topic"`
		Abstract   string `json:"abstract"`
	}
	c.BodyParser(&body)
	if body.PaperTitle != "" {
		setFields["paperTitle"] = body.PaperTitle
	}
	if body.Category != "" {
		setFields["category"] = body.Category
	}
	if body.Topic != "" {
		setFields["topic"] = body.Topic
	}
	if body.Abstract != "" {
		setFields["abstract"] = body.Abstract
	}

	col.UpdateOne(ctx, bson.M{"submissionId": submissionId, "email": email}, bson.M{"$set": setFields})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Submission updated successfully"})
}

func SubmitRevision(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "email": email}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Submission not found"})
	}

	file, err := c.FormFile("pdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "PDF file is required"})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	pdfUrl, pdfPublicId, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("%s_rev_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload PDF"})
	}

	revisionCount, _ := paper["revisionCount"].(int32)
	newRevCount := int(revisionCount) + 1
	now := time.Now()

	newVersion := bson.M{
		"version":     newRevCount + 1,
		"pdfUrl":      pdfUrl,
		"pdfPublicId": pdfPublicId,
		"pdfFileName": file.Filename,
		"submittedAt": now,
	}

	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"pdfUrl":        pdfUrl,
			"pdfPublicId":   pdfPublicId,
			"pdfFileName":   file.Filename,
			"status":        "Revision Submitted",
			"revisionCount": newRevCount,
			"updatedAt":     now,
		},
		"$push": bson.M{"versions": newVersion},
	})

	utils.EmitToUser(email, "paper:revision_submitted", fiber.Map{
		"submissionId": submissionId, "status": "Revision Submitted",
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Revised paper submitted successfully"})
}

func GetAllPapersAdmin(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	statusFilter := c.Query("status")
	categoryFilter := c.Query("category")
	search := c.Query("search")

	query := bson.M{}
	if statusFilter != "" {
		query["status"] = statusFilter
	}
	if categoryFilter != "" {
		query["category"] = categoryFilter
	}
	if search != "" {
		query["$or"] = bson.A{
			bson.M{"submissionId": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"paperTitle": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"authorName": bson.M{"$regex": search, "$options": "i"}},
			bson.M{"email": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	col := config.GetCollection("papersubmissions")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := col.Find(ctx, query, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching papers"})
	}
	defer cursor.Close(ctx)

	var papers []bson.M
	cursor.All(ctx, &papers)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(papers), "papers": papers})
}

func CheckFinalSelection(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	faCol := config.GetCollection("finalacceptances")
	var acceptance bson.M
	faCol.FindOne(ctx, bson.M{"authorEmail": email}).Decode(&acceptance)

	return c.Status(200).JSON(fiber.Map{
		"success":       true,
		"isSelected":    acceptance != nil,
		"acceptedPaper": acceptance,
	})
}

func GetPaperById(c *fiber.Ctx) error {
	id := c.Params("id")
	objId, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		// Try by submissionId
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		col := config.GetCollection("papersubmissions")
		var paper bson.M
		if err2 := col.FindOne(ctx, bson.M{"submissionId": id}).Decode(&paper); err2 != nil {
			return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
		}
		return c.Status(200).JSON(fiber.Map{"success": true, "paper": paper})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"_id": objId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "paper": paper})
}

func AssignEditor(c *fiber.Ctx) error {
	var input struct {
		PaperId  string `json:"paperId"`
		EditorId string `json:"editorId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	paperObjId, err := primitive.ObjectIDFromHex(input.PaperId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid paper ID"})
	}
	editorObjId, err := primitive.ObjectIDFromHex(input.EditorId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid editor ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"_id": paperObjId}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	usersCol := config.GetCollection("users")
	var editor bson.M
	if err := usersCol.FindOne(ctx, bson.M{"_id": editorObjId, "role": "Editor"}).Decode(&editor); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Editor not found"})
	}

	col.UpdateOne(ctx, bson.M{"_id": paperObjId}, bson.M{
		"$set": bson.M{
			"assignedEditor": editorObjId,
			"status":         "Assigned to Editor",
			"updatedAt":      time.Now(),
		},
	})

	editorEmail, _ := editor["email"].(string)
	editorName, _ := editor["username"].(string)
	submissionId, _ := paper["submissionId"].(string)
	paperTitle, _ := paper["paperTitle"].(string)
	authorName, _ := paper["authorName"].(string)
	category, _ := paper["category"].(string)

	go utils.SendEditorAssignmentEmail(editorEmail, editorName, utils.EditorPaperData{
		SubmissionId: submissionId,
		PaperTitle:   paperTitle,
		AuthorName:   authorName,
		Category:     category,
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Editor assigned successfully"})
}

func toTime(v interface{}) time.Time {
	switch t := v.(type) {
	case time.Time:
		return t
	case primitive.DateTime:
		return t.Time()
	default:
		return time.Time{}
	}
}

func ReuploadPaper(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	email := claims.Email

	file, err := c.FormFile("pdf")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "No file uploaded"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "email": email}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Submission not found or you don't have permission to update it"})
	}

	status, _ := paper["status"].(string)
	if status == "Accepted" || status == "Rejected" {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Paper has already been %s. Further uploads are not permitted.", strings.ToLower(status)),
		})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	pdfUrl, pdfPublicId, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload PDF: " + err.Error()})
	}

	versionsLen := 0
	if versions, ok := paper["versions"].(bson.A); ok {
		versionsLen = len(versions)
	}
	nextVersion := versionsLen + 1

	now := time.Now()
	newVersion := bson.M{
		"version":     nextVersion,
		"pdfUrl":      pdfUrl,
		"pdfPublicId": pdfPublicId,
		"pdfFileName": file.Filename,
		"submittedAt": now,
	}

	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"pdfUrl":      pdfUrl,
			"pdfPublicId": pdfPublicId,
			"pdfFileName": file.Filename,
			"updatedAt":   now,
		},
		"$push": bson.M{"versions": newVersion},
	})

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Paper version v%d uploaded successfully", nextVersion),
		"version": nextVersion,
		"pdfUrl":  pdfUrl,
	})
}

func GetRevisionData(c *fiber.Ctx) error {
	id := c.Params("submissionId")
	revNumStr := c.Query("revisionNumber", "1")
	revNum := 1
	if n, err := strconv.Atoi(revNumStr); err == nil {
		revNum = n
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := bson.M{"revisionNumber": revNum}
	objectIDPattern := regexp.MustCompile(`^[0-9a-fA-F]{24}$`)
	if objectIDPattern.MatchString(id) {
		if oid, err := primitive.ObjectIDFromHex(id); err == nil {
			query["paperId"] = oid
		}
	} else {
		query["submissionId"] = id
	}

	col := config.GetCollection("revisions")
	var revision bson.M
	if err := col.FindOne(ctx, query).Decode(&revision); err != nil {
		return c.Status(404).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("No revision %d found for this paper", revNum),
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"revision": fiber.Map{
			"submissionId":     revision["submissionId"],
			"paperId":          revision["paperId"],
			"revisionNumber":   revision["revisionNumber"],
			"revisionRound":    revision["revisionRound"],
			"cleanPdfUrl":      revision["cleanPdfUrl"],
			"highlightedPdfUrl": revision["highlightedPdfUrl"],
			"responsePdfUrl":   revision["responsePdfUrl"],
			"revisionStatus":   revision["revisionStatus"],
			"submittedAt":      revision["revisedPaperSubmittedAt"],
		},
	})
}

func GetAllRevisions(c *fiber.Ctx) error {
	id := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := bson.M{}
	objectIDPattern := regexp.MustCompile(`^[0-9a-fA-F]{24}$`)
	if objectIDPattern.MatchString(id) {
		if oid, err := primitive.ObjectIDFromHex(id); err == nil {
			query["paperId"] = oid
		}
	} else {
		query["submissionId"] = id
	}

	col := config.GetCollection("revisions")
	opts := options.Find().SetSort(bson.M{"revisionNumber": 1}).SetProjection(bson.M{
		"submissionId": 1, "paperId": 1, "revisionNumber": 1, "revisionStatus": 1, "submittedAt": 1,
	})
	cursor, err := col.Find(ctx, query, opts)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Error fetching revisions"})
	}
	defer cursor.Close(ctx)

	var revisions []bson.M
	cursor.All(ctx, &revisions)

	return c.Status(200).JSON(fiber.Map{
		"success":        true,
		"totalRevisions": len(revisions),
		"revisions":      revisions,
	})
}

func GetPaperHistory(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)
	role := claims.Role
	email := claims.Email

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Build query - support searching by email
	query := bson.M{"submissionId": submissionId}
	if strings.Contains(submissionId, "@") {
		query = bson.M{"email": strings.ToLower(submissionId)}
	}

	col := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := col.FindOne(ctx, query).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	// Permission check
	paperEmail, _ := paper["email"].(string)
	if role != "Admin" && role != "Editor" && paperEmail != email {
		return c.Status(403).JSON(fiber.Map{"success": false, "message": "You do not have permission to view this paper's history"})
	}

	timeline := []fiber.Map{}

	// 1. Initial submission
	paperTitle, _ := paper["paperTitle"].(string)
	authorName, _ := paper["authorName"].(string)
	paperCategory, _ := paper["category"].(string)
	paperTopic, _ := paper["topic"].(string)
	paperPdfUrl, _ := paper["pdfUrl"].(string)
	currentStatus, _ := paper["status"].(string)

	timeline = append(timeline, fiber.Map{
		"type":        "submission",
		"date":        paper["createdAt"],
		"title":       "Initial Submission",
		"description": fmt.Sprintf("Paper submitted by %s", authorName),
		"details": fiber.Map{
			"title":    paperTitle,
			"category": paperCategory,
			"topic":    paperTopic,
			"pdfUrl":   paperPdfUrl,
		},
	})

	// 2. Version history
	if versions, ok := paper["versions"].(bson.A); ok {
		for _, v := range versions {
			if ver, ok := v.(bson.M); ok {
				timeline = append(timeline, fiber.Map{
					"type":        "version_upload",
					"date":        ver["submittedAt"],
					"title":       fmt.Sprintf("Paper Version v%v Uploaded", ver["version"]),
					"description": fmt.Sprintf("Author uploaded a new version of the paper: %v", ver["pdfFileName"]),
					"details": fiber.Map{
						"version":  ver["version"],
						"pdfUrl":   ver["pdfUrl"],
						"fileName": ver["pdfFileName"],
					},
				})
			}
		}
	}

	// 3. Editor assignment
	if paper["assignedEditor"] != nil {
		timeline = append(timeline, fiber.Map{
			"type":        "assignment",
			"date":        paper["updatedAt"],
			"title":       "Editor Assigned",
			"description": "An editor was assigned to manage the paper.",
			"details": fiber.Map{
				"editor": paper["assignedEditor"],
			},
		})
	}

	// 4. Reviewer assignments
	if assignments, ok := paper["reviewAssignments"].(bson.A); ok {
		for _, a := range assignments {
			if asm, ok := a.(bson.M); ok {
				timeline = append(timeline, fiber.Map{
					"type":        "reviewer_assigned",
					"date":        asm["assignedAt"],
					"title":       "Reviewer Invited",
					"description": "A reviewer was invited to review.",
					"status":      asm["status"],
					"details": fiber.Map{
						"deadline": asm["deadline"],
					},
				})
				if asm["respondedAt"] != nil {
					asmStatus, _ := asm["status"].(string)
					timeline = append(timeline, fiber.Map{
						"type":        "reviewer_response",
						"date":        asm["respondedAt"],
						"title":       fmt.Sprintf("Reviewer %s", asmStatus),
						"description": fmt.Sprintf("Reviewer %s the invitation.", strings.ToLower(asmStatus)),
					})
				}
			}
		}
	}

	// 5. Reviews
	reviewsCol := config.GetCollection("reviews")
	reviewQuery := bson.M{}
	if paperId, ok := paper["_id"].(primitive.ObjectID); ok {
		reviewQuery["paper"] = paperId
	}
	reviewCursor, _ := reviewsCol.Find(ctx, reviewQuery, options.Find().SetSort(bson.M{"createdAt": 1}))
	var reviews []bson.M
	reviewCursor.All(ctx, &reviews)
	reviewCursor.Close(ctx)
	for _, review := range reviews {
		var overallRating interface{}
		if ratings, ok := review["ratings"].(bson.M); ok {
			overallRating = ratings["overall"]
		}
		timeline = append(timeline, fiber.Map{
			"type":        "review_submitted",
			"date":        review["createdAt"],
			"title":       "Review Submitted",
			"description": "A reviewer submitted their feedback.",
			"details": fiber.Map{
				"recommendation": review["recommendation"],
				"overall":        overallRating,
			},
		})
	}

	// 6. Revision cycles
	revisionsCol := config.GetCollection("revisions")
	revCursor, _ := revisionsCol.Find(ctx, bson.M{"submissionId": submissionId}, options.Find().SetSort(bson.M{"revisionNumber": 1}))
	var detailedRevisions []bson.M
	revCursor.All(ctx, &detailedRevisions)
	revCursor.Close(ctx)
	for _, rev := range detailedRevisions {
		timeline = append(timeline, fiber.Map{
			"type":        "revision_cycle",
			"date":        rev["revisionRequestedAt"],
			"title":       fmt.Sprintf("Revision Cycle Started (v%v)", rev["revisionNumber"]),
			"description": fmt.Sprintf("Revision requested by %v.", rev["editorName"]),
			"details": fiber.Map{
				"deadline": rev["revisionDeadline"],
				"message":  rev["revisionMessage"],
			},
		})
		if rev["revisedPaperSubmittedAt"] != nil {
			timeline = append(timeline, fiber.Map{
				"type":        "revised_submission_detailed",
				"date":        rev["revisedPaperSubmittedAt"],
				"title":       fmt.Sprintf("Corrected Paper Uploaded (v%v)", rev["revisionNumber"]),
				"description": "Author uploaded clean, highlighted, and response PDFs.",
				"details": fiber.Map{
					"cleanPdf":       rev["cleanPdfUrl"],
					"highlightedPdf": rev["highlightedPdfUrl"],
					"responsePdf":    rev["responsePdfUrl"],
				},
			})
		}
		finalOutcome, _ := rev["finalOutcome"].(string)
		if finalOutcome != "" && finalOutcome != "Pending" {
			timeline = append(timeline, fiber.Map{
				"type":        "revision_outcome",
				"date":        rev["updatedAt"],
				"title":       fmt.Sprintf("Revision Outcome (v%v)", rev["revisionNumber"]),
				"description": fmt.Sprintf("Revision was %s.", strings.ToLower(finalOutcome)),
				"details":     fiber.Map{"outcome": finalOutcome},
			})
		}
	}

	// 7. Messages
	msgCol := config.GetCollection("papermessages")
	var paperMessages bson.M
	msgCol.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paperMessages)
	if msgs, ok := paperMessages["messages"].(bson.A); ok {
		for _, m := range msgs {
			if msg, ok := m.(bson.M); ok {
				timeline = append(timeline, fiber.Map{
					"type":        "message",
					"date":        msg["timestamp"],
					"title":       fmt.Sprintf("Message from %v", msg["sender"]),
					"description": msg["message"],
					"details":     fiber.Map{"senderName": msg["senderName"]},
				})
			}
		}
	}

	// 8. Final decision
	if currentStatus == "Accepted" || currentStatus == "Rejected" {
		timeline = append(timeline, fiber.Map{
			"type":        "final_decision",
			"date":        paper["updatedAt"],
			"title":       fmt.Sprintf("Paper %s", currentStatus),
			"description": fmt.Sprintf("The final decision has been recorded as %s.", currentStatus),
			"details":     fiber.Map{"decision": currentStatus},
		})
	}

	// Sort timeline by date
	sort.SliceStable(timeline, func(i, j int) bool {
		ti := toTime(timeline[i]["date"])
		tj := toTime(timeline[j]["date"])
		return ti.Before(tj)
	})

	return c.Status(200).JSON(fiber.Map{
		"success":       true,
		"submissionId":  submissionId,
		"paperTitle":    paperTitle,
		"authorName":    authorName,
		"currentStatus": currentStatus,
		"timeline":      timeline,
	})
}
