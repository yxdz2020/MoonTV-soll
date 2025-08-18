/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `private, max-age=${cacheTime}` },
    });
  }

  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);

  const encoder = new TextEncoder();

  // 使用 TransformStream 确保 Edge 可以实时 flush
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    const aggregatedResults: any[] = [];

    for (const site of apiSites) {
      try {
        const generator = searchFromApiStream(site, query);

        for await (const pageResults of generator) {
          let filteredResults = pageResults;
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = pageResults.filter((result) => {
              const typeName = result.type_name || '';
              return !yellowWords.some((word) => typeName.includes(word));
            });
          }

          aggregatedResults.push(...filteredResults);

          // 流式写入每页结果
          await writer.write(encoder.encode(JSON.stringify({ pageResults: filteredResults }) + '\n'));
        }
      } catch (err: any) {
        console.warn(`搜索失败 ${site.name}:`, err.message);
      }
    }

    // 最终发送聚合结果
    await writer.write(encoder.encode(JSON.stringify({ aggregatedResults }) + '\n'));
    writer.close();
  })();

  const cacheTime = await getCacheTime();
  return new Response(readable, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `private, max-age=${cacheTime}`,
    },
  });
}
