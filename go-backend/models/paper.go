package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ReviewAssignment struct {
	Reviewer    primitive.ObjectID `bson:"reviewer,omitempty" json:"reviewer,omitempty"`
	Deadline    *time.Time         `bson:"deadline,omitempty" json:"deadline,omitempty"`
	Status      string             `bson:"status" json:"status"`
	AssignedAt  time.Time          `bson:"assignedAt" json:"assignedAt"`
	RespondedAt *time.Time         `bson:"respondedAt,omitempty" json:"respondedAt,omitempty"`
	EmailSent   bool               `bson:"emailSent" json:"emailSent"`
	EmailResent bool               `bson:"emailResent" json:"emailResent"`
	Review      primitive.ObjectID `bson:"review,omitempty" json:"review,omitempty"`
}

type RevisionRequest struct {
	RevisionNumber int                `bson:"revisionNumber" json:"revisionNumber"`
	RequestedAt    time.Time          `bson:"requestedAt" json:"requestedAt"`
	EditorComments string             `bson:"editorComments,omitempty" json:"editorComments,omitempty"`
	Deadline       *time.Time         `bson:"deadline,omitempty" json:"deadline,omitempty"`
	Status         string             `bson:"status" json:"status"`
	SubmittedAt    *time.Time         `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
	PdfUrl         string             `bson:"pdfUrl,omitempty" json:"pdfUrl,omitempty"`
	PdfPublicId    string             `bson:"pdfPublicId,omitempty" json:"pdfPublicId,omitempty"`
	PdfFileName    string             `bson:"pdfFileName,omitempty" json:"pdfFileName,omitempty"`
}

type PaperVersion struct {
	Version     int        `bson:"version" json:"version"`
	PdfUrl      string     `bson:"pdfUrl,omitempty" json:"pdfUrl,omitempty"`
	PdfPublicId string     `bson:"pdfPublicId,omitempty" json:"pdfPublicId,omitempty"`
	PdfBase64   string     `bson:"pdfBase64,omitempty" json:"pdfBase64,omitempty"`
	PdfFileName string     `bson:"pdfFileName,omitempty" json:"pdfFileName,omitempty"`
	SubmittedAt *time.Time `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
}

type PaperSubmission struct {
	ID                primitive.ObjectID   `bson:"_id,omitempty" json:"_id,omitempty"`
	SubmissionId      string               `bson:"submissionId" json:"submissionId"`
	PaperTitle        string               `bson:"paperTitle" json:"paperTitle"`
	AuthorName        string               `bson:"authorName" json:"authorName"`
	Email             string               `bson:"email" json:"email"`
	Category          string               `bson:"category" json:"category"`
	Abstract          string               `bson:"abstract,omitempty" json:"abstract,omitempty"`
	Topic             string               `bson:"topic,omitempty" json:"topic,omitempty"`
	PdfUrl            string               `bson:"pdfUrl,omitempty" json:"pdfUrl,omitempty"`
	PdfPublicId       string               `bson:"pdfPublicId,omitempty" json:"pdfPublicId,omitempty"`
	PdfBase64         string               `bson:"pdfBase64,omitempty" json:"pdfBase64,omitempty"`
	PdfFileName       string               `bson:"pdfFileName,omitempty" json:"pdfFileName,omitempty"`
	AbstractFileUrl   string               `bson:"abstractFileUrl,omitempty" json:"abstractFileUrl,omitempty"`
	Status            string               `bson:"status" json:"status"`
	AssignedEditor    primitive.ObjectID   `bson:"assignedEditor,omitempty" json:"assignedEditor,omitempty"`
	ReviewAssignments []ReviewAssignment   `bson:"reviewAssignments,omitempty" json:"reviewAssignments,omitempty"`
	AssignedReviewers []primitive.ObjectID `bson:"assignedReviewers,omitempty" json:"assignedReviewers,omitempty"`
	FinalDecision     string               `bson:"finalDecision,omitempty" json:"finalDecision,omitempty"`
	EditorComments    string               `bson:"editorComments,omitempty" json:"editorComments,omitempty"`
	EditorCorrections string               `bson:"editorCorrections,omitempty" json:"editorCorrections,omitempty"`
	RevisionCount     int                  `bson:"revisionCount" json:"revisionCount"`
	RevisionRequests  []RevisionRequest    `bson:"revisionRequests,omitempty" json:"revisionRequests,omitempty"`
	CollectionStatus  string               `bson:"collectionStatus" json:"collectionStatus"`
	IsMultiple        bool                 `bson:"isMultiple" json:"isMultiple"`
	Versions          []PaperVersion       `bson:"versions,omitempty" json:"versions,omitempty"`
	CreatedAt         time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt         time.Time            `bson:"updatedAt" json:"updatedAt"`
}
