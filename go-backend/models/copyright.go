package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CopyrightMessage struct {
	Sender        string             `bson:"sender" json:"sender"`
	SenderId      primitive.ObjectID `bson:"senderId,omitempty" json:"senderId,omitempty"`
	Message       string             `bson:"message" json:"message"`
	Timestamp     time.Time          `bson:"timestamp" json:"timestamp"`
	IsReadByAuthor bool              `bson:"isReadByAuthor" json:"isReadByAuthor"`
	IsReadByAdmin  bool              `bson:"isReadByAdmin" json:"isReadByAdmin"`
}

type Copyright struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	PaperId              primitive.ObjectID `bson:"paperId" json:"paperId"`
	SubmissionId         string             `bson:"submissionId" json:"submissionId"`
	AuthorEmail          string             `bson:"authorEmail" json:"authorEmail"`
	AuthorName           string             `bson:"authorName" json:"authorName"`
	PaperTitle           string             `bson:"paperTitle" json:"paperTitle"`
	CopyrightFormUrl     string             `bson:"copyrightFormUrl,omitempty" json:"copyrightFormUrl,omitempty"`
	CopyrightFormPublicId string            `bson:"copyrightFormPublicId,omitempty" json:"copyrightFormPublicId,omitempty"`
	Status               string             `bson:"status" json:"status"`
	SubmittedAt          *time.Time         `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
	CameraReadyUrl       string             `bson:"cameraReadyUrl,omitempty" json:"cameraReadyUrl,omitempty"`
	CameraReadyFileName  string             `bson:"cameraReadyFileName,omitempty" json:"cameraReadyFileName,omitempty"`
	CameraReadyUploadedAt *time.Time        `bson:"cameraReadyUploadedAt,omitempty" json:"cameraReadyUploadedAt,omitempty"`
	FinalDocUrl          string             `bson:"finalDocUrl,omitempty" json:"finalDocUrl,omitempty"`
	FinalDocUploadedAt   *time.Time         `bson:"finalDocUploadedAt,omitempty" json:"finalDocUploadedAt,omitempty"`
	Messages             []CopyrightMessage `bson:"messages,omitempty" json:"messages,omitempty"`
	CreatedAt            time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
}
