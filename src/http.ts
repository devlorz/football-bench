export interface HttpResponse {
  status: number;
  body: string;
}

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export type HttpRequestOptions = Omit<HttpRequest, "url">;

export type HttpFetcher = (
  url: string,
  options?: HttpRequestOptions
) => Promise<HttpResponse>;

export const nodeHttpFetcher: HttpFetcher = async (url, options) => {
  const request: RequestInit = {
    method: options?.method ?? "GET"
  };
  if (options?.headers !== undefined) {
    request.headers = options.headers;
  }
  if (options?.body !== undefined) {
    request.body = options.body;
  }
  const response = await fetch(url, request);
  return {
    status: response.status,
    body: await response.text()
  };
};
