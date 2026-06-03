/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  ...(process.env.NEXT_STATIC_EXPORT === "true" ? { output: "export" } : {})
};

export default nextConfig;
