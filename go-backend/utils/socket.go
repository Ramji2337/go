package utils

import (
	"sync"
)

type SocketHub struct {
	mu          sync.RWMutex
	connections map[string]chan interface{}
	adminConns  map[string]chan interface{}
}

var Hub = &SocketHub{
	connections: make(map[string]chan interface{}),
	adminConns:  make(map[string]chan interface{}),
}

func (h *SocketHub) Register(userID string, ch chan interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.connections[userID] = ch
}

func (h *SocketHub) RegisterAdmin(userID string, ch chan interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.adminConns[userID] = ch
}

func (h *SocketHub) Unregister(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.connections, userID)
	delete(h.adminConns, userID)
}

func (h *SocketHub) EmitToUser(userID string, event string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if ch, ok := h.connections[userID]; ok {
		select {
		case ch <- map[string]interface{}{"event": event, "data": data}:
		default:
		}
	}
}

func (h *SocketHub) EmitToAdmins(event string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.adminConns {
		select {
		case ch <- map[string]interface{}{"event": event, "data": data}:
		default:
		}
	}
}

func EmitToUser(userID string, event string, data interface{}) {
	Hub.EmitToUser(userID, event, data)
}

func EmitToAdmins(event string, data interface{}) {
	Hub.EmitToAdmins(event, data)
}
