package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupPaperRoutes(app *fiber.App) {
	papers := app.Group("/api/papers", middleware.VerifyJWT)
	papers.Get("/count", controllers.GetSubmittedPaperCount)
	papers.Post("/submit", controllers.SubmitPaper)
	papers.Post("/submit-multiple", controllers.SubmitMultiplePaper)
	papers.Get("/my-submission", controllers.GetUserSubmission)
	papers.Get("/check-selection", controllers.CheckFinalSelection)
	papers.Put("/edit/:submissionId", controllers.EditSubmission)
	papers.Post("/submit-revision", controllers.SubmitRevision)
	papers.Post("/reupload/:submissionId", controllers.ReuploadPaper)
	papers.Get("/status/:submissionId", controllers.GetPaperStatus)
	papers.Get("/revision/:submissionId", controllers.GetRevisionData)
	papers.Get("/revisions/:submissionId", controllers.GetAllRevisions)
	papers.Get("/all", middleware.RequireRole("Admin", "Editor"), controllers.GetAllPapersAdmin)
	papers.Get("/:submissionId/history", controllers.GetPaperHistory)
	papers.Get("/:id", middleware.RequireRole("Admin", "Editor", "Reviewer"), controllers.GetPaperById)
}
