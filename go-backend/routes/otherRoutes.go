package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCommitteeRoutes(app *fiber.App) {
	committee := app.Group("/api/committee")
	committee.Get("/", controllers.GetCommitteeMembers)
	committee.Post("/", middleware.VerifyJWT, middleware.RequireAdmin, controllers.CreateCommitteeMember)
	committee.Put("/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.UpdateCommitteeMember)
	committee.Delete("/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.DeleteCommitteeMember)
}

func SetupCopyrightRoutes(app *fiber.App) {
	copyright := app.Group("/api/copyright", middleware.VerifyJWT)
	copyright.Get("/", controllers.GetCopyrights)
	copyright.Get("/my", controllers.GetCopyrightByAuthor)
	copyright.Get("/:submissionId", controllers.GetCopyrightBySubmissionId)
	copyright.Post("/submit", controllers.SubmitCopyright)
	copyright.Post("/upload-camera-ready", controllers.UploadCameraReady)
	copyright.Post("/:submissionId/message", controllers.SendCopyrightMessage)
	copyright.Get("/:submissionId/messages", controllers.GetCopyrightMessages)
	copyright.Post("/:submissionId/final-doc", controllers.UploadFinalDoc)
	copyright.Put("/:submissionId/approve", middleware.RequireAdmin, controllers.ApproveCopyright)
}

func SetupPaperMessageRoutes(app *fiber.App) {
	messages := app.Group("/api/paper-messages", middleware.VerifyJWT)
	messages.Get("/:submissionId", controllers.GetPaperMessages)
	messages.Get("/", middleware.RequireRole("Admin", "Editor"), controllers.GetAllPaperMessagesAdmin)
	messages.Post("/send", controllers.SendPaperMessage)
	messages.Get("/my", controllers.GetUserPaperMessages)
}

func SetupSupportMessageRoutes(app *fiber.App) {
	support := app.Group("/api/support")
	support.Post("/", middleware.OptionalJWT, controllers.SubmitSupportMessage)
	support.Get("/", middleware.VerifyJWT, middleware.RequireAdmin, controllers.GetSupportMessages)
	support.Put("/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.UpdateSupportMessageStatus)
	support.Delete("/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.DeleteSupportMessage)
}

func SetupMembershipRoutes(app *fiber.App) {
	membership := app.Group("/api/membership", middleware.VerifyJWT)
	membership.Get("/check-membership", controllers.CheckMembership)
	membership.Get("/get-registration-fee", controllers.GetRegistrationFee)
	membership.Post("/check-user-membership", controllers.CheckUserMembership)
}

func SetupListenerRoutes(app *fiber.App) {
	listener := app.Group("/api/listener")
	listener.Post("/submit-listener", middleware.VerifyJWT, controllers.SubmitListenerRegistration)
	listener.Get("/my-listener-registration", middleware.VerifyJWT, controllers.GetMyListenerRegistration)
	listener.Get("/admin/all-listeners", middleware.VerifyJWT, middleware.RequireAdmin, controllers.GetAllListeners)
	listener.Get("/admin/pending", middleware.VerifyJWT, middleware.RequireAdmin, controllers.GetPendingListeners)
	listener.Get("/admin/all", middleware.VerifyJWT, middleware.RequireAdmin, controllers.GetAllListeners)
	listener.Put("/admin/verify/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.VerifyListener)
	listener.Put("/admin/reject/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.RejectListener)
	listener.Put("/admin/verify-listener/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.VerifyListener)
}

func SetupDebugRoutes(app *fiber.App) {
	debug := app.Group("/api")
	debug.Get("/debug/my-papers", middleware.VerifyJWT, controllers.DebugMyPapers)
	debug.Get("/debug/search-papers/:email", controllers.DebugSearchPapers)
}

func SetupAdminPaperSubmissionRoutes(app *fiber.App) {
	admin := app.Group("/api/admin-papers", middleware.VerifyJWT, middleware.RequireRole("Admin", "Editor"))
	admin.Get("/search-authors", controllers.SearchExistingAuthors)
	admin.Post("/submit-for-author", controllers.AdminSubmitPaperForAuthor)
}

func SetupAdminPaperAcceptanceRoutes(app *fiber.App) {
	admin := app.Group("/api/admin-acceptance", middleware.VerifyJWT)
	admin.Get("/pending-papers", middleware.RequireAdmin, controllers.GetAllPendingPapers)
	admin.Post("/accept-paper", middleware.RequireAdmin, controllers.AdminDirectAcceptPaper)
	admin.Post("/upload-camera-ready/:submissionId", middleware.RequireAdmin, controllers.AdminUploadCameraReady)
}

func SetupPaymentRegistrationRoutes(app *fiber.App) {
	payment := app.Group("/api/payment-registration", middleware.VerifyJWT)
	payment.Post("/submit", controllers.SubmitPaymentRegistration)
	payment.Get("/my", controllers.GetMyPaymentRegistration)
	payment.Get("/conference-data", controllers.GetConferenceRegistrationData)
	payment.Get("/all", middleware.RequireAdmin, controllers.GetAllPaymentRegistrations)
	payment.Put("/verify/:id", middleware.RequireAdmin, controllers.VerifyPaymentRegistration)
	payment.Put("/reject/:id", middleware.RequireAdmin, controllers.RejectPaymentRegistration)
}

func SetupDirectRoutes(app *fiber.App) {
	api := app.Group("/api")
	api.Get("/paper-count", controllers.GetPaperCountPublic)
	api.Get("/accepted-papers", controllers.GetPublicAcceptedPapers)
	api.Get("/committee-members", controllers.GetPublicCommitteeMembers)
	api.Get("/selected-users", controllers.GetConferenceSelectedUsersPublic)
	api.Post("/selected-users", middleware.VerifyJWT, middleware.RequireAdmin, controllers.AddConferenceSelectedUser)
	api.Delete("/selected-users/:id", middleware.VerifyJWT, middleware.RequireAdmin, controllers.RemoveConferenceSelectedUser)
	api.Get("/payment-done-users", middleware.VerifyJWT, middleware.RequireAdmin, controllers.GetPaymentDoneUsers)
}
