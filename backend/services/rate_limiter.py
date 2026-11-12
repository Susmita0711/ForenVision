import time
from threading import Lock


class LoginRateLimiter:
    """
    In-memory thread-safe rate limiter to prevent credential brute-force attacks.
    Tracks failed authentication attempts within a sliding time window.
    """

    def __init__(self, max_attempts: int = 5, lockout_seconds: int = 300):
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self._lock = Lock()
        # Maps key (e.g. lowercase email or IP) -> list of failed timestamp floats
        self._failures: dict[str, list[float]] = {}

    def is_rate_limited(self, key: str) -> tuple[bool, int]:
        """
        Check if the key is currently locked out.
        Returns (is_locked, remaining_lockout_seconds).
        """
        normalized_key = key.strip().lower()
        now = time.time()
        cutoff = now - self.lockout_seconds

        with self._lock:
            attempts = self._failures.get(normalized_key, [])
            # Filter attempts strictly within the sliding lockout window
            valid_attempts = [t for t in attempts if t > cutoff]
            self._failures[normalized_key] = valid_attempts

            if len(valid_attempts) >= self.max_attempts:
                oldest_in_window = valid_attempts[0]
                remaining = int(self.lockout_seconds - (now - oldest_in_window))
                return True, max(1, remaining)

            return False, 0

    def record_failure(self, key: str) -> int:
        """
        Record a failed authentication attempt.
        Returns the number of current failed attempts in the window.
        """
        normalized_key = key.strip().lower()
        now = time.time()
        cutoff = now - self.lockout_seconds

        with self._lock:
            attempts = self._failures.get(normalized_key, [])
            valid_attempts = [t for t in attempts if t > cutoff]
            valid_attempts.append(now)
            self._failures[normalized_key] = valid_attempts
            return len(valid_attempts)

    def record_success(self, key: str) -> None:
        """Clear failed attempts for a key upon successful authentication."""
        normalized_key = key.strip().lower()
        with self._lock:
            self._failures.pop(normalized_key, None)

    def reset_all(self) -> None:
        """Reset all rate limiter state (useful for test isolation)."""
        with self._lock:
            self._failures.clear()


# Default singleton rate limiter
rate_limiter = LoginRateLimiter(max_attempts=5, lockout_seconds=300)
