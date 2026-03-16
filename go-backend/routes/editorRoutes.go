package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupEditorRoutes(app *fiber.App) {
	editor := app.Group("/api/editor", middleware.VerifyJWT, middleware.RequireEditor)
	editor.Get("/verify-access", controllers.VerifyEditorAccess)
	editor.Get("/papers", controllers.GetAllPapersEditor)
	editor.Get("/pdf/:submissionId", controllers.GetPdfBase64)
	editor.Get("/papers/:paperId/reviews", controllers.GetPaperReviews)

	editor.Post("/reviewers", controllers.CreateReviewer)
	editor.Get("/reviewers", controllers.GetAllReviewers)
	editor.Put("/reviewers/:reviewerId", controllers.UpdateReviewerDetails)
	editor.Delete("/reviewers/:reviewerId", controllers.DeleteReviewerFromSystem)
	editor.Post("/assign-reviewers", controllers.AssignReviewers)
	editor.Post("/remove-reviewer", controllers.RemoveReviewerFromPaper)
	editor.Post("/send-reviewer-inquiry", controllers.SendReviewerInquiry)

	editor.Get("/review/:reviewId", controllers.GetReviewerDetails)
	editor.Get("/messages", controllers.GetAllMessages)
	editor.Get("/papers/:paperId/messages", controllers.GetPaperMessagesEditor)
	editor.Get("/messages/:submissionId/:reviewId", controllers.GetMessageThread)
	editor.Post("/send-message", controllers.SendMessageEditor)
	editor.Post("/send-message-to-reviewer", controllers.SendMessageToReviewer)
	editor.Post("/send-message-to-author", controllers.SendMessageToAuthor)

	editor.Post("/make-decision", controllers.MakeFinalDecision)
	editor.Post("/request-revision", controllers.RequestRevision)
	editor.Post("/accept-paper", controllers.AcceptPaper)
	editor.Post("/reject-paper/:paperId", controllers.RejectPaper)
	editor.Post("/send-re-review-emails", controllers.SendReReviewEmails)

	editor.Delete("/reviews/:reviewId", controllers.DeleteReview)
	editor.Put("/reviews/:reviewId", controllers.UpdateReview)
	editor.Get("/papers/:paperId/re-reviews", controllers.GetPaperReReviews)

	editor.Get("/non-responding-reviewers", controllers.GetNonRespondingReviewers)
	editor.Post("/send-reminder", controllers.SendReviewerReminder)
	editor.Post("/send-bulk-reminders", controllers.SendBulkReminders)

	editor.Get("/pdfs", controllers.GetAllPdfsEditor)
	editor.Delete("/pdfs", controllers.DeletePdfEditor)

	editor.Get("/dashboard-stats", controllers.GetEditorDashboardStats)

	// Accepted papers
	editor.Get("/accepted-papers", controllers.GetAllAcceptedPapers)
	editor.Get("/accepted-papers/category/:category", controllers.GetAcceptedPapersByCategory)
	editor.Get("/accepted-papers/author/:email", controllers.GetAcceptedPapersByAuthor)
	editor.Get("/accepted-papers/high-rated", controllers.GetHighRatedPapers)
	editor.Get("/accepted-papers/:submissionId", controllers.GetAcceptedPaperDetails)
	editor.Get("/acceptance-statistics", controllers.GetAcceptanceStatistics)
	editor.Put("/accepted-papers/:submissionId/status", controllers.UpdateAcceptanceStatus)

	editor.Get("/selected-users", controllers.GetConferenceSelectedUsers)
	editor.Post("/selected-users/send-email", controllers.SendSelectedUserEmail)
}
