# Changelog

All notable changes to this Terraform module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of the Azure Redis Cache Terraform module
- Support for Basic, Standard, and Premium SKUs
- Network isolation with VNet integration
- Private endpoint support
- Diagnostic settings for monitoring
- Redis modules support (Premium SKU only)
- Automated testing with GitHub Actions
- Comprehensive documentation and examples

### Changed
- N/A

### Fixed
- N/A

## [1.0.0] - 2023-09-15

### Added
- First stable release of the Redis module
- Complete test coverage
- CI/CD pipeline with GitHub Actions
- Detailed documentation

### Changed
- Standardized variable and output names
- Improved validation and error handling

### Fixed
- Various bug fixes and improvements

## [0.1.0] - 2023-09-01

### Added
- Initial version of the Redis module
- Basic functionality for creating Redis caches
- Basic documentation

## Security

### Security Updates
- Enabled TLS 1.2 by default
- Disabled non-SSL port by default
- Restrict public network access by default
- Support for customer-managed keys for encryption at rest

### Known Security Issues
- None at this time

## Upgrade Notes

### Upgrading from 0.1.0 to 1.0.0
- Variable names have been standardized (e.g., `redis_name` → `name`)
- Added new required variables for better security defaults
- Improved validation and error messages

## Deprecation Notices
- None at this time

## Contributors
- [Your Name] - Initial work

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
