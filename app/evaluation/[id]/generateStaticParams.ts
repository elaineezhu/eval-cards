import fs from "fs";
import path from "path";

export async function generateStaticParams() {
  const evaluationsDir = path.join(process.cwd(), "public/evaluations");
  const files = fs.readdirSync(evaluationsDir);

  const params = files.map((file) => {
    const filePath = path.join(evaluationsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return { id: data.id };
  });

  return params;
}
