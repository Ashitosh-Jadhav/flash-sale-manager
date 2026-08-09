# Routes

This directory will contain Express route definitions.

Routes map HTTP methods + URL paths to controller functions.

Example: `POST /api/orders` → `orderController.createOrder`

Routes should contain NO business logic — they only define the mapping.
