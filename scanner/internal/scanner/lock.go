package scanner

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

var errScanInProgress = errors.New("scan already in progress")

type scanLock struct {
	file *os.File
}

func acquireScanLock(dbPath string) (*scanLock, error) {
	lockPath := dbPath + ".lock"
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, err
	}

	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errScanInProgress
		}
		return nil, err
	}

	return &scanLock{file: f}, nil
}

func (l *scanLock) release() {
	if l == nil || l.file == nil {
		return
	}
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	_ = l.file.Close()
}