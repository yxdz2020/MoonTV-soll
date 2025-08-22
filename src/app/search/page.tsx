/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef,useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';

import FailedSourcesDisplay from '@/components/FailedSourcesDisplay';
import PageLayout from '@/components/PageLayout';
import SearchSuggestions from '@/components/SearchSuggestions';
import VideoCard from '@/components/VideoCard';

function SearchPageClient() {
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [failedSources, setFailedSources] = useState<{ name: string; key: string; error: string }[]>([]);

  // 获取默认聚合设置
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) return JSON.parse(userSetting);
    }
    return true;
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() =>
    getDefaultAggregate() ? 'agg' : 'all'
  );

  // 流式搜索开关（仅读取设置中的默认值）
  const getDefaultStream = () => {
    if (typeof window !== 'undefined') {
      const defaultSaved = localStorage.getItem('defaultStreamSearch');
      if (defaultSaved !== null) return defaultSaved === 'true';
    }
    return true;
  };
  const [streamEnabled, setStreamEnabled] = useState<boolean>(() => getDefaultStream());
  // 不再将页面内切换写入任何本地键，始终以 defaultStreamSearch 作为默认来源

  // 聚合后的结果
  const aggregatedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    searchResults.forEach((item) => {
      const key = `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'}-${
        item.episodes.length === 1 ? 'movie' : 'tv'
      }`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const aExactMatch = a[1][0].title.replaceAll(' ', '').includes(searchQuery.trim().replaceAll(' ', ''));
      const bExactMatch = b[1][0].title.replaceAll(' ', '').includes(searchQuery.trim().replaceAll(' ', ''));
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      const aYear = a[1][0].year;
      const bYear = b[1][0].year;
      if (aYear === bYear) return a[0].localeCompare(b[0]);
      if (aYear === 'unknown') return 1;
      if (bYear === 'unknown') return 1;
      return aYear > bYear ? -1 : 1;
    });
  }, [searchResults]);

  useEffect(() => {
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();
    getSearchHistory().then(setSearchHistory);

    const unsubscribe = subscribeToDataUpdates('searchHistoryUpdated', (newHistory: string[]) => {
      setSearchHistory(newHistory);
    });

    const getScrollTop = () => document.body.scrollTop || 0;
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
      requestAnimationFrame(checkScrollPosition);
    };
    isRunning = true;
    checkScrollPosition();

    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false;
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      fetchSearchResults(query);
      setShowSuggestions(false);
      addSearchHistory(query);
    } else {
      setShowResults(false);
      setShowSuggestions(false);
    }
  }, [searchParams]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSearchResults = async (query: string) => {
    // 取消上一次搜索
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setIsLoading(true);
      setSearchResults([]);
      setFailedSources([]);
      setShowResults(true);

      const enableStream = streamEnabled;

      const params = new URLSearchParams({ q: query.trim() });
      if (!enableStream) params.set('stream', '0');

      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!enableStream) {
        // 非流式：一次性获取并基于是否为空由服务端设置缓存头
        const json = await response.json();
        const finalResults = (json.aggregatedResults || []) as SearchResult[];
        const finalFailedSources = (json.failedSources || []) as { name: string; key: string; error: string }[];
        setSearchResults(finalResults);
        setFailedSources(finalFailedSources);
        setIsLoading(false);
      } else {
        // 流式：逐行解析
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let buffer = '';
        let firstResult = true;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          if (value) {
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const json = JSON.parse(line);
                if (json.pageResults && json.pageResults.length > 0) {
                  setSearchResults((prev) => [...prev, ...json.pageResults]);
                  if (firstResult) {
                    setIsLoading(false);
                    firstResult = false;
                  }
                }
                if (json.failedSources) {
                  setFailedSources(json.failedSources);
                }
              } catch (err) {
                console.warn('解析流式结果失败', err, line);
              }
            }
          }
        }

        // 处理最后一段
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.pageResults) {
              setSearchResults((prev) => [...prev, ...json.pageResults]);
            }
            if (json.failedSources) {
              setFailedSources(json.failedSources);
            }
          } catch (err) {
            console.warn('最后一段解析失败', err, buffer);
          }
        }
      }

      setIsLoading(false);

    } catch (error: any) {
      if (error.name === 'AbortError') return; // 被取消的请求不用报错
      console.error('搜索失败', error);
      setSearchResults([]);
    }
  };



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(!!value.trim());
  };

  const handleInputFocus = () => {
    if (searchQuery.trim()) setShowSuggestions(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    setSearchQuery(trimmed);
    setIsLoading(true);
    setShowResults(true);
    setShowSuggestions(false);

    fetchSearchResults(trimmed);
    addSearchHistory(trimmed);

    const newUrl = `/search?q=${encodeURIComponent(trimmed)}`;
    window.history.pushState({}, '', newUrl); // 改 URL 并入历史
    
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    setIsLoading(true);
    setShowResults(true);

    fetchSearchResults(suggestion);
    addSearchHistory(suggestion);
    const newUrl = `/search?q=${encodeURIComponent(suggestion)}`;
    window.history.pushState({}, '', newUrl); // 改 URL 并入历史
    
  };

  const scrollToTop = () => {
    try {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        <div className='mb-8'>
          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder='搜索电影、电视剧...'
                className='w-full h-12 rounded-lg bg-gray-50/80 py-3 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border border-gray-200/50 shadow-sm dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700 dark:border-gray-700'
              />
              <SearchSuggestions
                query={searchQuery}
                isVisible={showSuggestions}
                onSelect={handleSuggestionSelect}
                onClose={() => setShowSuggestions(false)}
              />
            </div>
          </form>
        </div>

        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {isLoading ? (
            <div className='flex justify-center items-center h-40'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
            </div>
          ) : showResults ? (
            <section className='mb-12'>
              <div className='mb-8 flex items-center justify-between'>
                <div className='flex items-center gap-4'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    搜索结果
                  </h2>
                  {/* 显示失败的数据源 */}
                  <FailedSourcesDisplay 
                    failedSources={failedSources}
                  />
                </div>
                <div className='flex items-center gap-4'>
                  <label className='flex items-center gap-2 cursor-pointer select-none'>
                    <span className='text-sm text-gray-700 dark:text-gray-300'>流式</span>
                    <div className='relative'>
                      <input
                        type='checkbox'
                        className='sr-only peer'
                        checked={streamEnabled}
                        onChange={() => setStreamEnabled(!streamEnabled)}
                      />
                      <div className='w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                      <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                    </div>
                  </label>

                  <label className='flex items-center gap-2 cursor-pointer select-none'>
                    <span className='text-sm text-gray-700 dark:text-gray-300'>聚合</span>
                    <div className='relative'>
                      <input
                        type='checkbox'
                        className='sr-only peer'
                        checked={viewMode === 'agg'}
                        onChange={() => setViewMode(viewMode === 'agg' ? 'all' : 'agg')}
                      />
                      <div className='w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                      <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                    </div>
                  </label>
                </div>
              </div>

              <div
                key={`search-results-${viewMode}`}
                className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
              >
                {viewMode === 'agg'
                  ? aggregatedResults.map(([mapKey, group], index) => (
                      <div key={`agg-${mapKey}-${index}`} className='w-full'>
                        <VideoCard
                          from='search'
                          items={group}
                          query={searchQuery.trim() !== group[0].title ? searchQuery.trim() : ''}
                        />
                      </div>
                    ))
                  : searchResults.map((item, index) => (
                      <div key={`all-${item.source}-${item.id}-${index}`} className='w-full'>
                        <VideoCard
                          id={item.id}
                          title={item.title}
                          poster={item.poster}
                          episodes={item.episodes.length}
                          source={item.source}
                          source_name={item.source_name}
                          douban_id={item.douban_id}
                          query={searchQuery.trim() !== item.title ? searchQuery.trim() : ''}
                          year={item.year}
                          from='search'
                          type={item.episodes.length > 1 ? 'tv' : 'movie'}
                        />
                      </div>
                    ))}
                {searchResults.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    未找到相关结果
                  </div>
                )}
              </div>
            </section>
          ) : searchHistory.length > 0 ? (
            <section className='mb-12'>
              <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                搜索历史
                {searchHistory.length > 0 && (
                  <button
                    onClick={() => clearSearchHistory()}
                    className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                  >
                    清空
                  </button>
                )}
              </h2>
              <div className='flex flex-wrap gap-2'>
                {searchHistory.map((item, index) => (
                  <div key={`history-${item}-${index}`} className='relative group'>
                    <button
                      onClick={() => {
                        setSearchQuery(item);
                        router.push(`/search?q=${encodeURIComponent(item.trim())}`);
                      }}
                      className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                    >
                      {item}
                    </button>
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item);
                      }}
                      className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                    >
                      <X className='w-3 h-3' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
