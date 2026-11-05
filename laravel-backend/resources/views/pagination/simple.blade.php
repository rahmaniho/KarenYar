@if ($paginator->hasPages())
    <nav class="pager-nav" aria-label="صفحه‌بندی">
        {{-- Previous Page Link --}}
        @if ($paginator->onFirstPage())
            <span class="pager-btn disabled">قبلی</span>
        @else
            <button type="button" class="pager-btn" wire:click="previousPage('{{ $paginator->getPageName() }}')" rel="prev">قبلی</button>
        @endif

        {{-- Page Numbers --}}
        <div class="pager-numbers">
            @foreach ($elements as $element)
                {{-- "Three Dots" Separator --}}
                @if (is_string($element))
                    <span class="pager-dots">{{ $element }}</span>
                @endif

                {{-- Array Of Links --}}
                @if (is_array($element))
                    @foreach ($element as $page => $url)
                        @if ($page == $paginator->currentPage())
                            <span class="pager-num active">{{ \App\Support\Format::fa($page) }}</span>
                        @else
                            <button type="button" class="pager-num" wire:click="gotoPage({{ $page }}, '{{ $paginator->getPageName() }}')">{{ \App\Support\Format::fa($page) }}</button>
                        @endif
                    @endforeach
                @endif
            @endforeach
        </div>

        {{-- Next Page Link --}}
        @if ($paginator->hasMorePages())
            <button type="button" class="pager-btn" wire:click="nextPage('{{ $paginator->getPageName() }}')" rel="next">بعدی</button>
        @else
            <span class="pager-btn disabled">بعدی</span>
        @endif
    </nav>
@endif