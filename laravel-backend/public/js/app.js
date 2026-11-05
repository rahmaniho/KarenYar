(function () {
    'use strict';

    /* ---------- Confirm destructive forms ---------- */
    document.addEventListener('submit', function (event) {
        var form = event.target;

        if (form instanceof HTMLFormElement && form.hasAttribute('data-confirm')) {
            if (!window.confirm(form.getAttribute('data-confirm'))) {
                event.preventDefault();
            }
        }
    });

    /* ---------- Invoice form: product formula toggling + preview ---------- */
    var form = document.querySelector('[data-invoice-form]');

    if (form) {
        var productSelect = form.querySelector('[data-product-select]');
        var unitLabel = form.querySelector('[data-unit-label]');
        var percentBlocks = form.querySelectorAll('[data-percent-block]');
        var preview = form.querySelector('[data-total-preview]');
        var previewValue = form.querySelector('[data-total-preview-value]');

        function currentFormula() {
            var option = productSelect.selectedOptions[0];
            return option ? option.getAttribute('data-formula') : '';
        }

        function currentUnit() {
            var option = productSelect.selectedOptions[0];
            return option ? option.getAttribute('data-unit') : '—';
        }

        function number(name) {
            var input = form.querySelector('[name="' + name + '"]');
            var value = input ? parseFloat(input.value) : 0;

            return isNaN(value) ? 0 : value;
        }

        function updateUi() {
            var formula = currentFormula();

            if (unitLabel) {
                unitLabel.textContent = currentUnit();
            }

            percentBlocks.forEach(function (block) {
                block.hidden = block.getAttribute('data-percent-block') !== formula;
            });

            renderPreview(formula);
        }

        function scrubInactiveFields() {
            // Percent values that belong to another formula are submitted as 0
            // so the stored invoice always matches its product's formula.
            percentBlocks.forEach(function (block) {
                if (block.hidden) {
                    block.querySelectorAll('input').forEach(function (input) {
                        input.value = '0';
                    });
                }
            });
        }

        function renderPreview(formula) {
            if (!preview || !previewValue) {
                return;
            }

            var quantity = number('quantity');
            var unitPrice = number('unit_price');
            var laborPct = number('labor_percent');
            var profitPct = number('profit_percent');
            var vatPct = number('vat_percent');
            var commissionPct = number('commission_percent');

            var total = 0;

            if (formula === 'gold') {
                var raw = quantity * unitPrice;
                var labor = raw * (laborPct / 100);
                var profit = (raw + labor) * (profitPct / 100);
                var vat = (raw + labor + profit) * (vatPct / 100);
                total = raw + labor + profit + vat;
            } else if (formula === 'dollar') {
                total = quantity * unitPrice * (1 + commissionPct / 100);
            } else {
                total = quantity * unitPrice;
            }

            if (quantity > 0 && unitPrice > 0) {
                preview.hidden = false;
                previewValue.textContent = Math.round(total).toLocaleString('en-US') + ' تومان';
            } else {
                preview.hidden = true;
            }
        }

        productSelect.addEventListener('change', updateUi);
        form.addEventListener('input', renderPreview);

        form.addEventListener('submit', function () {
            scrubInactiveFields();
        });

        updateUi();
    }

    /* ---------- Live number formatting for prices forms ---------- */
    var pricesForm = document.querySelector('[data-prices-form]');

    if (pricesForm) {
        pricesForm.querySelectorAll('input[type="number"]').forEach(function (input) {
            input.addEventListener('blur', function () {
                var value = parseFloat(input.value);

                if (!isNaN(value)) {
                    input.value = Math.round(value);
                }
            });
        });
    }
})();
