<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Live market prices from moj3.ir.
 *
 * The moj3.ir/price page is server-rendered: it ships a table of the
 * current Toman price for every asset plus a separate "intrinsic value"
 * table. This class fetches that page and parses the values our product
 * catalog cares about, so the stored prices can be refreshed from a
 * real market source instead of the simulated walk in PriceService.
 */
class Moj3PriceSource
{
    public const URL = 'https://moj3.ir/price/';

    /**
     * moj3.ir asset labels mapped to our product keys.
     *
     * "سکه امامی" is the current-design full coin (طرح جدید) and
     * "سکه تمام" is the older Bahar Azadi full coin (طرح قدیم).
     *
     * @var array<string, string>
     */
    protected const LABEL_TO_PRODUCT = [
        'طلای 18 عیار' => Products::GOLD18,
        'دلار' => Products::DOLLAR,
        'سکه طرح جدید' => Products::SEKE_EMAMI,
        'سکه طرح قدیم' => Products::SEKE_TAMAM,
        'نیم سکه' => Products::NIM_SEKE,
        'ربع سکه' => Products::ROB_SEKE,
    ];

    /** The moj3.ir label for the global gold ounce (in USD). */
    protected const GOLD_OUNCE_LABEL = 'انس جهانی طلا';

    /** The moj3.ir label of the intrinsic value of 18kt gold. */
    protected const INTRINSIC_GOLD18_LABEL = 'ارزش ذاتی طلای 18 عیار';

    /**
     * Fetch the live prices from moj3.ir.
     *
     * @return array<string, array{price: int, intrinsic?: int, gold_ounce?: int, gold_ounce_change?: float}>
     */
    public static function fetch(): array
    {
        $response = Http::withHeaders([
            'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
            'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language' => 'fa-IR,fa;q=0.9,en;q=0.8',
        ])->timeout(20)->retry(2, 300)->get(static::URL);

        $response->throw();

        return static::parse($response->body());
    }

    /**
     * Parse the moj3.ir price page into per-product Toman prices.
     *
     * The reference table uses these columns:
     *   دارایی | قیمت (Toman) | حباب | درصد تغییرات | مبلغ تغییر
     * so cell 1 is the price, cell 2 the حباب (bubble) and cell 3 the
     * daily change percent.
     *
     * @return array<string, array{price: int, intrinsic?: int, change?: float, bubble?: float}>
     *
     * @throws RuntimeException when no known asset could be located.
     */
    public static function parse(string $html): array
    {
        $doc = new \DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8">'.$html);
        libxml_use_internal_errors($previous);

        $xpath = new \DOMXPath($doc);

        // Walk every row: the first two cells are always the label and the
        // price; the following cells hold bubble / change / delta amounts.
        // The first occurrence of a label wins.
        $values = [];
        $changes = [];
        $bubbles = [];

        foreach ($xpath->query('//tr') as $row) {
            $cells = $row->getElementsByTagName('td');

            if ($cells->length < 2) {
                continue;
            }

            $label = static::clean($cells->item(0)->textContent);
            $digits = static::toInt($cells->item(1)->textContent);

            if ($label === '' || $digits <= 0 || isset($values[$label])) {
                continue;
            }

            $values[$label] = $digits;

            // Positional columns (matching the reference table layout):
            //   cell 2 = حباب (bubble), cell 3 = درصد تغییرات (change).
            $bubbleCell = $cells->length > 2 ? static::clean($cells->item(2)->textContent) : '';
            $changeCell = $cells->length > 3 ? static::clean($cells->item(3)->textContent) : '';

            $bubble = static::percent($bubbleCell);
            $change = static::percent($changeCell);

            if ($bubble !== null) {
                $bubbles[$label] = $bubble;
            }

            if ($change !== null) {
                $changes[$label] = $change;
            }
        }

        $market = [];

        foreach (static::LABEL_TO_PRODUCT as $label => $product) {
            if (isset($values[$label])) {
                $market[$product]['price'] = $values[$label];
            }

            if (isset($changes[$label])) {
                $market[$product]['change'] = $changes[$label];
            }

            if (isset($bubbles[$label])) {
                $market[$product]['bubble'] = $bubbles[$label];
            }
        }

        if (isset($values[static::INTRINSIC_GOLD18_LABEL])) {
            $market[Products::GOLD18]['intrinsic'] = $values[static::INTRINSIC_GOLD18_LABEL];
        }

        // Gold ounce (global, in USD) — captured as a separate value, not
        // part of the tradable product catalogue.
        if (isset($values[static::GOLD_OUNCE_LABEL])) {
            $market[Products::GOLD18]['gold_ounce'] = $values[static::GOLD_OUNCE_LABEL];
        }

        if (isset($changes[static::GOLD_OUNCE_LABEL])) {
            $market[Products::GOLD18]['gold_ounce_change'] = $changes[static::GOLD_OUNCE_LABEL];
        }

        if ($market === []) {
            throw new RuntimeException('هیچ قیمتی از صفحه moj3.ir قابل استخراج نبود؛ ساختار صفحه تغییر کرده است.');
        }

        return $market;
    }

    /**
     * Collapse whitespace inside a table cell.
     */
    protected static function clean(string $text): string
    {
        return trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    }

    /**
     * Parse a signed percentage cell such as "+2.20%" into a float, or
     * return null when the cell is empty / not a percentage.
     */
    protected static function percent(string $cell): ?float
    {
        $occurrences = [];

        return preg_match('/^([+-]?\d+(?:\.\d+)?)\s*%$/', static::clean($cell), $occurrences) === 1
            ? (float) $occurrences[1]
            : null;
    }

    /**
     * Reduce a price cell to an integer in Toman.
     */
    protected static function toInt(string $value): int
    {
        $digits = str_replace(['٬', ',', ' ', "\u{00A0}"], '', Format::input($value));

        return (int) $digits;
    }
}
