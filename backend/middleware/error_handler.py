import logging
from flask import jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger("forenvision.error_handler")


def register_error_handlers(app):
    """
    Register consistent JSON error responses for HTTP error statuses and uncaught exceptions.
    Ensures backend never leaks raw stack traces or internal secrets to API callers.
    """

    @app.errorhandler(400)
    def bad_request(error):
        msg = getattr(error, "description", "The browser or client submitted a malformed request.")
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": str(msg),
            "status_code": 400
        }), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({
            "success": False,
            "error": "Unauthorized",
            "message": "Authentication required to access this forensic endpoint.",
            "status_code": 401
        }), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": "Access denied. Insufficient clearance or invalid role permissions.",
            "status_code": 403
        }), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": "The requested forensic resource or endpoint was not found on this server.",
            "status_code": 404
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({
            "success": False,
            "error": "Method Not Allowed",
            "message": "The HTTP method is not allowed for the requested resource.",
            "status_code": 405
        }), 405

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "success": False,
            "error": "Payload Too Large",
            "message": "Uploaded evidence file exceeds the maximum permitted payload size limit.",
            "status_code": 413
        }), 413

    @app.errorhandler(500)
    def internal_server_error(error):
        logger.error("Internal Server Error: %s", error)
        return jsonify({
            "success": False,
            "error": "Internal Server Error",
            "message": "An unexpected error occurred within the forensic processing pipeline.",
            "status_code": 500
        }), 500

    @app.errorhandler(Exception)
    def handle_unexpected_exception(error):
        # Pass through standard HTTPExceptions so specific handlers or status codes apply
        if isinstance(error, HTTPException):
            return jsonify({
                "success": False,
                "error": error.name,
                "message": error.description,
                "status_code": error.code
            }), error.code

        logger.exception("Uncaught server exception: %s", error.__class__.__name__)
        return jsonify({
            "success": False,
            "error": "Internal Server Error",
            "message": "An unhandled exception occurred during request execution.",
            "status_code": 500
        }), 500
