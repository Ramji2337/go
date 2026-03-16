package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupReviewerRoutes(app *fiber.App) {
	reviewer := app.Group("/api/reviewer")

	// Public routes
	reviewer.Get("/assignment/:assignmentId", controllers.GetAssignmentDetails)
	reviewer.Post("/accept-assignment", controllers.AcceptAssignment)
	reviewer.Post("/reject-assignment", controllers.RejectAssignment)

	// Legacy token-based
	reviewer.Post("/accept-with-token", controllers.AcceptReviewerAssignment)
	reviewer.Post("/reject-with-token", controllers.RejectReviewerAssignment)
	reviewer.Get("/rejection-form", controllers.GetRejectionForm)

	// Authenticated routes
	reviewer.Use(middleware.VerifyJWT, middleware.RequireReviewer)
	reviewer.Get("/papers", controllers.GetAssignedPapersReviewer)
	reviewer.Get("/papers/:submissionId", controllers.GetPaperForReview)
	reviewer.Get("/papers/:submissionId/draft", controllers.GetReviewDraft)
	reviewer.Post("/papers/:submissionId/submit-review", controllers.SubmitReview)
	reviewer.Post("/papers/:submissionId/submit-re-review", controllers.SubmitReReview)
	reviewer.Post("/papers/:submissionId/accept-assignment", controllers.AcceptAssignmentBySubmission)
	reviewer.Get("/dashboard-stats", controllers.GetReviewerDashboardStats)

	// Messaging
	reviewer.Get("/messages", controllers.GetAllMessageThreadsReviewer)
	reviewer.Get("/messages/:submissionId", controllers.GetMessageThreadReviewer)
	reviewer.Post("/send-message", controllers.SendMessageReviewer)
}
