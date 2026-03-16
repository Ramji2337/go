package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PaperMessageItem struct {
	Sender     string             `bson:"sender" json:"sender"`
	SenderId   primitive.ObjectID `bson:"senderId" json:"senderId"`
	SenderName string             `bson:"senderName,omitempty" json:"senderName,omitempty"`
	Message    string             `bson:"message" json:"message"`
	Timestamp  time.Time          `bson:"timestamp" json:"timestamp"`
}

type PaperMessage struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	SubmissionId  string             `bson:"submissionId" json:"submissionId"`
	PaperId       primitive.ObjectID `bson:"paperId" json:"paperId"`
	AuthorEmail   string             `bson:"authorEmail" json:"authorEmail"`
	EditorId      primitive.ObjectID `bson:"editorId,omitempty" json:"editorId,omitempty"`
	Messages      []PaperMessageItem `bson:"messages,omitempty" json:"messages,omitempty"`
	LastMessageAt time.Time          `bson:"lastMessageAt" json:"lastMessageAt"`
	CreatedAt     time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type SupportMessageItem struct {
	Sender         string             `bson:"sender" json:"sender"`
	SenderId       primitive.ObjectID `bson:"senderId" json:"senderId"`
	SenderName     string             `bson:"senderName,omitempty" json:"senderName,omitempty"`
	Message        string             `bson:"message" json:"message"`
	Timestamp      time.Time          `bson:"timestamp" json:"timestamp"`
	IsReadByAuthor bool               `bson:"isReadByAuthor" json:"isReadByAuthor"`
	IsReadByAdmin  bool               `bson:"isReadByAdmin" json:"isReadByAdmin"`
}

type SupportMessage struct {
	ID            primitive.ObjectID   `bson:"_id,omitempty" json:"_id,omitempty"`
	AuthorId      primitive.ObjectID   `bson:"authorId" json:"authorId"`
	AuthorEmail   string               `bson:"authorEmail" json:"authorEmail"`
	AuthorName    string               `bson:"authorName,omitempty" json:"authorName,omitempty"`
	Messages      []SupportMessageItem `bson:"messages,omitempty" json:"messages,omitempty"`
	LastMessageAt time.Time            `bson:"lastMessageAt" json:"lastMessageAt"`
	Status        string               `bson:"status" json:"status"`
	CreatedAt     time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time            `bson:"updatedAt" json:"updatedAt"`
}
