import "./globals.css";

export const metadata = {
  title: "Relay OTP Console",
  description: "Manage the Android SMS gateway",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
