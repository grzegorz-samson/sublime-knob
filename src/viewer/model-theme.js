import { DataTexture, RedFormat, RepeatWrapping, LinearFilter, UnsignedByteType } from 'three';

const DARK_MATERIALS = new Map([
  ['Warm white laminated face', { color: '#090a0b', roughness: 0.96, envMapIntensity: 0.18 }],
  ['Birch plywood face', { color: '#302016', roughness: 0.96, envMapIntensity: 0.1 }],
  ['Plywood layer 0', { color: '#241811', roughness: 0.96, envMapIntensity: 0.1 }],
  ['Plywood layer 1', { color: '#39291c', roughness: 0.96, envMapIntensity: 0.1 }],
  ['Plywood layer 2', { color: '#1b100a', roughness: 0.97, envMapIntensity: 0.1 }],
  ['Uncoated panel reverse', { color: '#21150e', roughness: 0.96, envMapIntensity: 0.1 }],
]);

const POINTER_NAME = 'Long black pointer';

function matteGrain() {
  const size = 128;
  const data = new Uint8Array(size * size);
  let seed = 137;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const texture = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.repeat.set(18, 24);
  texture.needsUpdate = true;
  return texture;
}

/** Reversible material colorway for the exhibition model. */
export class ModelTheme {
  constructor({ model }) {
    this.model = model;
    this.faceGrain = matteGrain();
    this.originals = new Map();
    this.pointerOriginalMaterial = null;
    this.pointerDarkMaterial = null;
    this.pointer =
      model?.getObjectByName(POINTER_NAME) ??
      model?.getObjectByName(POINTER_NAME.replaceAll(' ', '_')) ??
      null;
    this.bottom =
      model?.getObjectByName('Bottom plywood') ?? model?.getObjectByName('Bottom_plywood') ?? null;
    this.bottomOriginalMaterial = this.bottom?.material ?? null;
    this.bottomDarkMaterial = null;

    model?.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material || this.originals.has(material)) continue;
        this.originals.set(material, {
          color: material.color?.clone(),
          metalness: material.metalness,
          roughness: material.roughness,
          envMapIntensity: material.envMapIntensity,
          bumpMap: material.bumpMap,
          bumpScale: material.bumpScale,
        });
      }
    });

    // The interior floor catches the studio environment at grazing angles.
    // Isolate its finish so reducing that reflection leaves the exterior wood intact.
    if (this.bottomOriginalMaterial) {
      this.bottomDarkMaterial = this.bottomOriginalMaterial.clone();
      this.bottomDarkMaterial.color.set('#241a13');
      this.bottomDarkMaterial.roughness = 1;
      this.bottomDarkMaterial.metalness = 0;
      this.bottomDarkMaterial.envMapIntensity = 0.1;
    }

    // Keep the pointer isolated from any other meshes sharing its source material.
    if (this.pointer?.material) {
      this.pointerOriginalMaterial = this.pointer.material;
      this.pointerDarkMaterial = Array.isArray(this.pointer.material)
        ? this.pointer.material.map((material) => material.clone())
        : this.pointer.material.clone();
      const pointerMaterials = Array.isArray(this.pointerDarkMaterial)
        ? this.pointerDarkMaterial
        : [this.pointerDarkMaterial];
      for (const material of pointerMaterials) {
        material.color?.set('#c8d0da');
        if ('metalness' in material) material.metalness = 0.58;
        if ('roughness' in material) material.roughness = 0.48;
        if ('envMapIntensity' in material) material.envMapIntensity *= 0.55;
      }
    }
  }

  apply(dark) {
    if (!this.model) return;
    if (!dark) {
      for (const [material, original] of this.originals) {
        if (original.color && material.color) material.color.copy(original.color);
        if (original.metalness !== undefined) material.metalness = original.metalness;
        if (original.roughness !== undefined) material.roughness = original.roughness;
        if (original.envMapIntensity !== undefined)
          material.envMapIntensity = original.envMapIntensity;
        if (material.bumpMap !== original.bumpMap) {
          material.bumpMap = original.bumpMap;
          material.needsUpdate = true;
        }
        if (original.bumpScale !== undefined) material.bumpScale = original.bumpScale;
      }
      if (this.pointer && this.pointerOriginalMaterial) {
        this.pointer.material = this.pointerOriginalMaterial;
      }
      if (this.bottom && this.bottomOriginalMaterial) {
        this.bottom.material = this.bottomOriginalMaterial;
      }
      return;
    }

    for (const [material, original] of this.originals) {
      // Keep small metal highlights, while suppressing the strong studio reflections.
      if (original.envMapIntensity !== undefined) {
        material.envMapIntensity = original.envMapIntensity * 0.55;
      }
      if (original.roughness !== undefined) {
        material.roughness = Math.max(original.roughness, original.metalness > 0.5 ? 0.42 : 0.6);
      }
      const palette = DARK_MATERIALS.get(material.name);
      if (!palette) continue;
      material.color?.set(palette.color);
      if (palette.roughness !== undefined && 'roughness' in material) {
        material.roughness = palette.roughness;
      }
      if ('envMapIntensity' in material) material.envMapIntensity = palette.envMapIntensity;
      if (material.name === 'Warm white laminated face') {
        material.metalness = 0;
        if (material.bumpMap !== this.faceGrain) {
          material.bumpMap = this.faceGrain;
          material.needsUpdate = true;
        }
        material.bumpScale = 0.00008;
      }
    }
    if (this.pointer && this.pointerDarkMaterial) {
      this.pointer.material = this.pointerDarkMaterial;
    }
    if (this.bottom && this.bottomDarkMaterial) {
      this.bottom.material = this.bottomDarkMaterial;
    }
  }
}
