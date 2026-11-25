import { z } from 'zod';

/**
 * Converts a Zod v4 runtime validation schema into a clean JSON Schema object
 * suitable for OpenAPI 3.1.0, stripping the top-level $schema URI.
 */
export function schemaToJson(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = json;
  void _ignored;
  return rest;
}

/**
 * Generates an OpenAPI 3.1.0 requestBody object bound directly to a Zod schema
 * with modern named examples (`examples: { Example: { value } }`).
 */
export function body<T extends z.ZodTypeAny>(
  validationSchema: T,
  samplePayload?: z.input<T>,
  description = 'Validated JSON request payload'
) {
  const schema = schemaToJson(validationSchema);
  return {
    required: true,
    description,
    content: {
      'application/json': {
        schema,
        ...(samplePayload !== undefined
          ? {
              examples: {
                Example: {
                  value: samplePayload,
                },
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Wraps a JSON Schema object in a standard JSON response definition.
 */
export function jsonResponse(
  description: string,
  schema: Record<string, unknown>,
  sampleValue?: unknown
) {
  return {
    description,
    content: {
      'application/json': {
        schema,
        ...(sampleValue !== undefined
          ? {
              examples: {
                Example: {
                  value: sampleValue,
                },
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Wraps a data payload schema in a structured success envelope for OpenAPI 3.1 responses.
 */
export function envelope(
  dataSchema: Record<string, unknown>,
  description = 'Successful operation',
  sampleValue?: unknown
) {
  return jsonResponse(description, dataSchema, sampleValue);
}

/**
 * Concise helper for status/action responses without nested entity payloads.
 */
export function messageOnly(
  description: string,
  sampleValue: Record<string, unknown>,
  _statusCode = 200
) {
  void _statusCode;
  return jsonResponse(
    description,
    {
      type: 'object',
      additionalProperties: true,
    },
    sampleValue
  );
}

/**
 * Standard error response generator referencing `#/components/schemas/ErrorResponse`.
 */
export function errorResponse(description: string, sampleMessage: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        examples: {
          Example: {
            value: {
              error: sampleMessage,
            },
          },
        },
      },
    },
  };
}
