package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CommitteeLinks struct {
	Email    string `bson:"email,omitempty" json:"email,omitempty"`
	Website  string `bson:"website,omitempty" json:"website,omitempty"`
	Linkedin string `bson:"linkedin,omitempty" json:"linkedin,omitempty"`
	Twitter  string `bson:"twitter,omitempty" json:"twitter,omitempty"`
}

type CommitteeMember struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Name        string             `bson:"name" json:"name"`
	Role        string             `bson:"role" json:"role"`
	Affiliation string             `bson:"affiliation" json:"affiliation"`
	Country     string             `bson:"country,omitempty" json:"country,omitempty"`
	Designation string             `bson:"designation,omitempty" json:"designation,omitempty"`
	Image       string             `bson:"image,omitempty" json:"image,omitempty"`
	Links       CommitteeLinks     `bson:"links,omitempty" json:"links,omitempty"`
	Order       int                `bson:"order" json:"order"`
	Active      bool               `bson:"active" json:"active"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}
