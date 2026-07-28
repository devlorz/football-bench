export interface HttpResponse {
  status: number;
  body: string;
}

export type HttpFetcher = (url: string) => Promise<HttpResponse>;

export const nodeHttpFetcher: HttpFetcher = async (url) => {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.text()
  };
};
