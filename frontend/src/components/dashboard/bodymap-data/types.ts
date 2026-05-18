export interface BodyPart {
  slug: string;
  color: string;
  path: {
    left?: string[];
    right?: string[];
    common?: string[];
  };
}
