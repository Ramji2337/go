package controllers

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"go-backend/config"
	"go-backend/middleware"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetCopyrights(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, _ := col.Find(ctx, bson.M{}, opts)
	defer cursor.Close(ctx)
	var copyrights []bson.M
	cursor.All(ctx, &copyrights)

	return c.Status(200).JSON(fiber.Map{"success": true, "count": len(copyrights), "copyrights": copyrights})
}

func GetCopyrightByAuthor(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	cursor, _ := col.Find(ctx, bson.M{"authorEmail": claims.Email})
	defer cursor.Close(ctx)
	var copyrights []bson.M
	cursor.All(ctx, &copyrights)

	return c.Status(200).JSON(fiber.Map{"success": true, "copyrights": copyrights})
}

func GetCopyrightBySubmissionId(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "copyright": copyright})
}

func SubmitCopyright(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	submissionId := c.FormValue("submissionId")
	if submissionId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Submission ID is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	papersCol := config.GetCollection("papersubmissions")
	var paper bson.M
	if err := papersCol.FindOne(ctx, bson.M{"submissionId": submissionId, "email": claims.Email}).Decode(&paper); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Paper not found"})
	}

	var copyrightFormUrl, copyrightFormPublicId string

	file, err := c.FormFile("copyrightForm")
	if err == nil && file != nil {
		f, _ := file.Open()
		defer f.Close()
		fileBytes := make([]byte, file.Size)
		f.Read(fileBytes)

		copyrightFormUrl, copyrightFormPublicId, err = config.UploadPDF(ctx, fileBytes,
			fmt.Sprintf("copyright_%s_%s", submissionId, file.Filename))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload copyright form"})
		}
	}

	paperId, _ := paper["_id"].(primitive.ObjectID)
	now := time.Now()

	col := config.GetCollection("copyrights")
	var existing bson.M
	col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&existing)

	if existing != nil {
		col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
			"$set": bson.M{
				"copyrightFormUrl":      copyrightFormUrl,
				"copyrightFormPublicId": copyrightFormPublicId,
				"status":                "Submitted",
				"submittedAt":           now,
				"updatedAt":             now,
			},
		})
	} else {
		doc := bson.M{
			"paperId":               paperId,
			"submissionId":          submissionId,
			"authorEmail":           claims.Email,
			"authorName":            paper["authorName"],
			"paperTitle":            paper["paperTitle"],
			"copyrightFormUrl":      copyrightFormUrl,
			"copyrightFormPublicId": copyrightFormPublicId,
			"status":                "Submitted",
			"submittedAt":           now,
			"createdAt":             now,
			"updatedAt":             now,
		}
		col.InsertOne(ctx, doc)
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Copyright form submitted successfully"})
}

func UploadCameraReady(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	submissionId := c.FormValue("submissionId")
	if submissionId == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Submission ID is required"})
	}

	file, err := c.FormFile("cameraReady")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Camera ready file is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId, "authorEmail": claims.Email}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright form not found"})
	}

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	url, _, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("cameraready_%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload file"})
	}

	now := time.Now()
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"cameraReadyUrl":        url,
			"cameraReadyFileName":   file.Filename,
			"cameraReadyUploadedAt": now,
			"updatedAt":             now,
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Camera ready version uploaded", "url": url})
}

func SendCopyrightMessage(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	claims := c.Locals("user").(*middleware.JWTClaims)

	var input struct {
		Message string `json:"message"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	senderId, _ := primitive.ObjectIDFromHex(claims.UserID)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	msg := bson.M{
		"sender":         claims.Role,
		"senderId":       senderId,
		"message":        input.Message,
		"timestamp":      time.Now(),
		"isReadByAuthor": claims.Role == "Author",
		"isReadByAdmin":  claims.Role == "Admin",
	}

	col := config.GetCollection("copyrights")
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$push": bson.M{"messages": msg},
		"$set":  bson.M{"updatedAt": time.Now()},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Message sent"})
}

func GetCopyrightMessages(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	var copyright bson.M
	if err := col.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	messages, _ := copyright["messages"].(primitive.A)
	return c.Status(200).JSON(fiber.Map{"success": true, "messages": messages})
}

func UploadFinalDoc(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	file, err := c.FormFile("finalDoc")
	if err != nil || file == nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Final document is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	f, _ := file.Open()
	defer f.Close()
	fileBytes := make([]byte, file.Size)
	f.Read(fileBytes)

	url, _, err := config.UploadPDF(ctx, fileBytes, fmt.Sprintf("finaldoc_%s_%s", submissionId, file.Filename))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to upload file"})
	}

	now := time.Now()
	col := config.GetCollection("copyrights")
	col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"finalDocUrl":        url,
			"finalDocUploadedAt": now,
			"updatedAt":          now,
		},
	})

	// Update ConferenceSelectedUser too
	csCol := config.GetCollection("conferenceselectedusers")
	csCol.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{
			"finalDocUrl":         url,
			"finalDocSubmittedAt": now,
			"updatedAt":           now,
		},
	})

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Final document uploaded", "url": url})
}

func ApproveCopyright(c *fiber.Ctx) error {
	submissionId := c.Params("submissionId")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	col := config.GetCollection("copyrights")
	result, err := col.UpdateOne(ctx, bson.M{"submissionId": submissionId}, bson.M{
		"$set": bson.M{"status": "Approved", "updatedAt": time.Now()},
	})
	if err != nil || result.MatchedCount == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright not found"})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Copyright approved"})
}

func GetAuthorCopyrightDashboard(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	authorEmail := claims.Email
	safeEmail := regexp.QuoteMeta(authorEmail)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	emailRegex := bson.M{"$regex": "^" + safeEmail + "$", "$options": "i"}

	// 1. Get papers from multiple collections
	paperCol := config.GetCollection("papersubmissions")
	cursor1, _ := paperCol.Find(ctx, bson.M{"email": emailRegex})
	var mainPapers []bson.M
	cursor1.All(ctx, &mainPapers)
	cursor1.Close(ctx)

	faCol := config.GetCollection("finalacceptances")
	cursor2, _ := faCol.Find(ctx, bson.M{"authorEmail": emailRegex})
	var finalAcceptedPapers []bson.M
	cursor2.All(ctx, &finalAcceptedPapers)
	cursor2.Close(ctx)

	// 2. Merge and de-duplicate by submissionId
	submissionMap := make(map[string]bson.M)

	mergePaper := func(p bson.M, source string) {
		sid, _ := p["submissionId"].(string)
		if sid == "" {
			return
		}
		sidLower := strings.ToLower(sid)
		p["_source"] = source

		// Normalize email fields
		if p["email"] == nil && p["authorEmail"] != nil {
			p["email"] = p["authorEmail"]
		}
		if p["authorEmail"] == nil && p["email"] != nil {
			p["authorEmail"] = p["email"]
		}

		existing, exists := submissionMap[sidLower]
		if !exists {
			submissionMap[sidLower] = p
			return
		}

		if source == "FinalAcceptance" {
			if p["status"] != nil {
				existing["status"] = p["status"]
			}
			if p["finalDecision"] != nil {
				existing["finalDecision"] = p["finalDecision"]
			}
		}
		for key, val := range p {
			if existing[key] == nil && val != nil {
				existing[key] = val
			}
		}
		if source == "FinalAcceptance" && p["pdfUrl"] != nil {
			existing["pdfUrl"] = p["pdfUrl"]
		}
	}

	for _, p := range mainPapers {
		mergePaper(p, "PaperSubmission")
	}
	for _, p := range finalAcceptedPapers {
		mergePaper(p, "FinalAcceptance")
	}

	allPapers := make([]bson.M, 0, len(submissionMap))
	for _, p := range submissionMap {
		allPapers = append(allPapers, p)
	}

	if len(allPapers) == 0 {
		return c.Status(200).JSON(fiber.Map{
			"success": true, "hasPaper": false, "message": "No paper submission found.",
		})
	}

	// 3. Enrich with copyright information
	copyrightCol := config.GetCollection("copyrights")
	notifications := fiber.Map{
		"unreadMessages":     0,
		"pendingCopyrights":  0,
		"pendingCameraReady": 0,
		"totalTasks":         0,
	}

	for i, p := range allPapers {
		sid, _ := p["submissionId"].(string)
		safeSid := regexp.QuoteMeta(sid)

		var copyright bson.M
		copyrightCol.FindOne(ctx, bson.M{"submissionId": bson.M{"$regex": "^" + safeSid + "$", "$options": "i"}}).Decode(&copyright)

		// Check if paper is accepted
		status, _ := p["status"].(string)
		finalDecision, _ := p["finalDecision"].(string)
		isAccepted := status == "Accepted" || status == "Published" || status == "Certificate Generated" || finalDecision == "Accept"

		if copyright == nil && isAccepted {
			authorName, _ := p["authorName"].(string)
			if authorName == "" {
				authorName = "Author"
			}
			paperTitle, _ := p["paperTitle"].(string)
			if paperTitle == "" {
				paperTitle = "Untitled Paper"
			}
			newCopyright := bson.M{
				"submissionId": sid,
				"authorEmail":  authorEmail,
				"authorName":   authorName,
				"paperTitle":   paperTitle,
				"status":       "Pending",
				"createdAt":    time.Now(),
				"updatedAt":    time.Now(),
			}
			if paperId, ok := p["_id"]; ok {
				newCopyright["paperId"] = paperId
			}
			res, err := copyrightCol.InsertOne(ctx, newCopyright)
			if err == nil {
				newCopyright["_id"] = res.InsertedID
				copyright = newCopyright
			} else {
				// Might be duplicate, try to fetch
				copyrightCol.FindOne(ctx, bson.M{"submissionId": bson.M{"$regex": "^" + safeSid + "$", "$options": "i"}}).Decode(&copyright)
			}
		}

		allPapers[i]["copyright"] = copyright

		if copyright != nil {
			// Count unread messages
			unread := 0
			if msgs, ok := copyright["messages"].(bson.A); ok {
				for _, m := range msgs {
					if msg, ok := m.(bson.M); ok {
						sender, _ := msg["sender"].(string)
						isRead, _ := msg["isReadByAuthor"].(bool)
						if sender == "Admin" && !isRead {
							unread++
						}
					}
				}
			}
			allPapers[i]["unreadCount"] = unread
			notifications["unreadMessages"] = notifications["unreadMessages"].(int) + unread

			crStatus, _ := copyright["status"].(string)
			if crStatus == "Pending" || crStatus == "Rejected" {
				allPapers[i]["needsCopyright"] = true
				notifications["pendingCopyrights"] = notifications["pendingCopyrights"].(int) + 1
				notifications["totalTasks"] = notifications["totalTasks"].(int) + 1
			}

			if isAccepted && copyright["cameraReadyUrl"] == nil {
				allPapers[i]["needsCameraReady"] = true
				notifications["pendingCameraReady"] = notifications["pendingCameraReady"].(int) + 1
				notifications["totalTasks"] = notifications["totalTasks"].(int) + 1
			}
		}
	}

	// Sort: accepted first, then by createdAt desc
	sort.SliceStable(allPapers, func(i, j int) bool {
		acceptedStatuses := map[string]bool{"Accepted": true, "Published": true, "Certificate Generated": true}
		aStatus, _ := allPapers[i]["status"].(string)
		bStatus, _ := allPapers[j]["status"].(string)
		aFinal, _ := allPapers[i]["finalDecision"].(string)
		bFinal, _ := allPapers[j]["finalDecision"].(string)
		aAccepted := acceptedStatuses[aStatus] || aFinal == "Accept"
		bAccepted := acceptedStatuses[bStatus] || bFinal == "Accept"
		if aAccepted && !bAccepted {
			return true
		}
		if !aAccepted && bAccepted {
			return false
		}
		return false // maintain original order for same category
	})

	// Get payment info
	payCol := config.GetCollection("paymentdonefinalusers")
	var payment bson.M
	payCol.FindOne(ctx, bson.M{"authorEmail": emailRegex}).Decode(&payment)

	return c.Status(200).JSON(fiber.Map{
		"success":       true,
		"hasPaper":      true,
		"notifications": notifications,
		"data": fiber.Map{
			"payment":   payment,
			"paper":     allPapers[0],
			"allPapers": allPapers,
			"copyright": allPapers[0]["copyright"],
		},
	})
}

func ReviewCopyrightForm(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)

	var input struct {
		CopyrightId  string `json:"copyrightId"`
		Status       string `json:"status"`
		AdminComment string `json:"adminComment"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	if input.Status != "Approved" && input.Status != "Rejected" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid status"})
	}

	copyrightObjId, err := primitive.ObjectIDFromHex(input.CopyrightId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid copyright ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	copyrightCol := config.GetCollection("copyrights")
	var copyright bson.M
	if err := copyrightCol.FindOne(ctx, bson.M{"_id": copyrightObjId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright record not found"})
	}

	update := bson.M{"$set": bson.M{"status": input.Status, "updatedAt": time.Now()}}
	if input.AdminComment != "" {
		msg := bson.M{
			"sender":    "Admin",
			"senderId":  claims.UserID,
			"message":   fmt.Sprintf("Review: %s. Comment: %s", input.Status, input.AdminComment),
			"timestamp": time.Now(),
		}
		update["$push"] = bson.M{"messages": msg}
	}

	copyrightCol.UpdateOne(ctx, bson.M{"_id": copyrightObjId}, update)

	// If approved, create ConferenceSelectedUser record
	if input.Status == "Approved" {
		submissionId, _ := copyright["submissionId"].(string)
		authorEmail, _ := copyright["authorEmail"].(string)
		authorName, _ := copyright["authorName"].(string)
		paperTitle, _ := copyright["paperTitle"].(string)
		copyrightFormUrl, _ := copyright["copyrightFormUrl"].(string)

		// Get paper details
		paperCol := config.GetCollection("papersubmissions")
		var paper bson.M
		paperCol.FindOne(ctx, bson.M{"submissionId": submissionId}).Decode(&paper)

		// Get payment details
		payCol := config.GetCollection("paymentdonefinalusers")
		var payment bson.M
		payCol.FindOne(ctx, bson.M{"authorEmail": authorEmail}).Decode(&payment)

		paperUrl := "N/A"
		category := ""
		abstract := ""
		var revisionRounds interface{} = 0
		if paper != nil {
			if v, ok := paper["pdfUrl"].(string); ok {
				paperUrl = v
			}
			category, _ = paper["category"].(string)
			abstract, _ = paper["abstract"].(string)
			if v, ok := paper["revisionCount"]; ok {
				revisionRounds = v
			}
		}

		var paymentId interface{}
		var registrationNumber interface{}
		if payment != nil {
			paymentId = payment["_id"]
			registrationNumber = payment["registrationNumber"]
		}

		selectedCol := config.GetCollection("conferenceselectedusers")
		selectedCol.UpdateOne(ctx,
			bson.M{"submissionId": submissionId},
			bson.M{"$set": bson.M{
				"authorEmail":          authorEmail,
				"authorName":           authorName,
				"paperTitle":           paperTitle,
				"submissionId":         submissionId,
				"paperUrl":             paperUrl,
				"copyrightUrl":         copyrightFormUrl,
				"paymentId":            paymentId,
				"registrationNumber":   registrationNumber,
				"category":             category,
				"abstract":             abstract,
				"revisionRounds":       revisionRounds,
				"paperSubmittedAt":     paper["createdAt"],
				"copyrightSubmittedAt": copyright["updatedAt"],
				"selectionDate":        time.Now(),
				"status":               "Confirmed",
			}},
			options.Update().SetUpsert(true),
		)
	}

	// Refetch updated copyright
	var updatedCopyright bson.M
	copyrightCol.FindOne(ctx, bson.M{"_id": copyrightObjId}).Decode(&updatedCopyright)

	return c.Status(200).JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Copyright form %s successfully", strings.ToLower(input.Status)),
		"data":    updatedCopyright,
	})
}

func MarkCopyrightMessagesAsRead(c *fiber.Ctx) error {
	claims := c.Locals("user").(*middleware.JWTClaims)
	userRole := claims.Role

	var input struct {
		CopyrightId string `json:"copyrightId"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid request"})
	}

	copyrightObjId, err := primitive.ObjectIDFromHex(input.CopyrightId)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid copyright ID"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	copyrightCol := config.GetCollection("copyrights")
	var copyright bson.M
	if err := copyrightCol.FindOne(ctx, bson.M{"_id": copyrightObjId}).Decode(&copyright); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Copyright record not found"})
	}

	msgs, ok := copyright["messages"].(bson.A)
	if !ok || len(msgs) == 0 {
		return c.Status(200).JSON(fiber.Map{"success": true, "message": "No messages to mark"})
	}

	modified := false
	for i, m := range msgs {
		if msg, ok := m.(bson.M); ok {
			sender, _ := msg["sender"].(string)
			if userRole == "Author" && sender == "Admin" {
				isRead, _ := msg["isReadByAuthor"].(bool)
				if !isRead {
					msg["isReadByAuthor"] = true
					msgs[i] = msg
					modified = true
				}
			} else if userRole == "Admin" && sender == "Author" {
				isRead, _ := msg["isReadByAdmin"].(bool)
				if !isRead {
					msg["isReadByAdmin"] = true
					msgs[i] = msg
					modified = true
				}
			}
		}
	}

	if modified {
		copyrightCol.UpdateOne(ctx, bson.M{"_id": copyrightObjId}, bson.M{"$set": bson.M{"messages": msgs}})
	}

	return c.Status(200).JSON(fiber.Map{"success": true, "message": "Messages marked as read"})
}
