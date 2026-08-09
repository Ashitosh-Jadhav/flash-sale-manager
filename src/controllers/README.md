# Controllers

This directory will contain request handler functions.

Controllers receive the parsed request, call the appropriate service/model,
and send back the response.

They should NOT contain database queries directly — that goes in models/services.
