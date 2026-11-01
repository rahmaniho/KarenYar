<?php
declare(strict_types=1);

/**
 * Shared key/signature encoding for the Karen license API.
 *
 * Browser contract: unpadded base64url (RFC 4648 section 5).
 * Legacy PHP test clients may send standard base64, with or without padding.
 * Whitespace, malformed padding and non-canonical trailing bits are rejected.
 * This file contains no secrets and performs no database or network access.
 */

if (!function_exists('karen_license_decode_key_material')) {
    /**
     * Decode exactly $expectedBytes bytes, or return null for invalid input.
     * Accepts canonical base64url and canonical standard base64 only.
     */
    function karen_license_decode_key_material(string $encoded, int $expectedBytes): ?string
    {
        if ($expectedBytes < 1 || $expectedBytes > 4096) {
            return null;
        }

        $maxEncodedLength = intdiv($expectedBytes + 2, 3) * 4;
        if ($encoded === '' || strlen($encoded) > $maxEncodedLength) {
            return null;
        }

        if (!preg_match('/^[A-Za-z0-9+\/_-]+={0,2}$/D', $encoded)) {
            return null;
        }

        $normalized = strtr($encoded, '-_', '+/');
        $remainder = strlen($normalized) % 4;
        if ($remainder === 1) {
            return null;
        }
        if ($remainder > 0) {
            $normalized .= str_repeat('=', 4 - $remainder);
        }

        $decoded = base64_decode($normalized, true);
        if ($decoded === false || strlen($decoded) !== $expectedBytes) {
            return null;
        }

        // Compare against both canonical alphabets. This rejects aliases with
        // nonzero unused trailing bits instead of silently accepting them.
        $standard = base64_encode($decoded);
        $urlSafe = rtrim(strtr($standard, '+/', '-_'), '=');
        if (
            $encoded !== $urlSafe
            && $encoded !== rtrim($standard, '=')
            && $encoded !== $standard
        ) {
            return null;
        }

        return $decoded;
    }
}
