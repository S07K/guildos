const scenes = {
  horizon: 'watercolor-horizon-meets-digital-canvas',
  headland: 'misty-headland-and-luminous-sea',
  sailboat: 'watercolor-Dawn-Sailboat-in-Pixel-Sky',
};

export function LandscapeImage({ scene, className = '', priority = false }: {
  scene: keyof typeof scenes;
  className?: string;
  priority?: boolean;
}) {
  const source = `/assets/${scenes[scene]}`;
  const largeWidth = scene === 'horizon' ? 1600 : 1536;
  return <img
    className={`landscape-image ${className}`}
    data-parallax={scene === 'headland' ? undefined : ''}
    src={`${source}-1600.webp`}
    srcSet={`${source}-800.webp 800w, ${source}-1600.webp ${largeWidth}w`}
    sizes={scene === 'headland' ? '(max-width: 640px) 100vw, 50vw' : '100vw'}
    width={largeWidth}
    height={scene === 'horizon' ? 900 : 1024}
    alt=""
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
  />;
}
