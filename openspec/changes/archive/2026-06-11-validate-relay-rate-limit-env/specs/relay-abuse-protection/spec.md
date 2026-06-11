## MODIFIED Requirements

### Requirement: Development-only limiter configuration
The relay SHALL expose simple environment configuration for development rate-limit windows and limits while documenting that production needs distributed abuse protection.

#### Scenario: Rate limit environment is omitted
- **WHEN** no rate-limit environment variables are set
- **THEN** the relay uses safe development defaults

#### Scenario: Malformed rate limit environment is rejected
- **WHEN** a rate-limit limit or window environment variable is empty, partial, fractional, negative, zero where a positive value is required, or below the minimum window
- **THEN** the relay rejects the configuration before using the limiter
