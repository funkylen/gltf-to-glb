// Copyright 2016 The Draco Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

/**
 * @param {THREE.LoadingManager} manager
 */
THREE.DRACOLoader = function (manager) {
  this.timeLoaded = 0;
  this.manager = manager || THREE.DefaultLoadingManager;
  this.materials = null;
  this.verbosity = 0;
  this.attributeOptions = {};
  this.drawMode = THREE.TrianglesDrawMode;
  // Native Draco attribute type to Three.JS attribute type.
  this.nativeAttributeMap = {
    position: 'POSITION',
    normal: 'NORMAL',
    color: 'COLOR',
    uv: 'TEX_COORD',
  };
};

THREE.DRACOLoader.prototype = {
  constructor: THREE.DRACOLoader,

  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const loader = new THREE.FileLoader(scope.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    if (this.crossOrigin !== undefined) {
      loader.crossOrigin = this.crossOrigin;
    }
    loader.load(
      url,
      (blob) => {
        scope.decodeDracoFile(blob, onLoad);
      },
      onProgress,
      onError,
    );
  },

  setPath(value) {
    this.path = value;
    return this;
  },

  setCrossOrigin(value) {
    this.crossOrigin = value;
    return this;
  },

  setVerbosity(level) {
    this.verbosity = level;
    return this;
  },

  /**
   *  Sets desired mode for generated geometry indices.
   *  Can be either:
   *      THREE.TrianglesDrawMode
   *      THREE.TriangleStripDrawMode
   */
  setDrawMode(drawMode) {
    this.drawMode = drawMode;
    return this;
  },

  /**
   * Skips dequantization for a specific attribute.
   * |attributeName| is the THREE.js name of the given attribute type.
   * The only currently supported |attributeName| is 'position', more may be
   * added in future.
   */
  setSkipDequantization(attributeName, skip) {
    let skipDequantization = true;
    if (typeof skip !== 'undefined') skipDequantization = skip;
    this.getAttributeOptions(attributeName).skipDequantization = skipDequantization;
    return this;
  },

  /**
   * |attributeUniqueIdMap| specifies attribute unique id for an attribute in
   * the geometry to be decoded. The name of the attribute must be one of the
   * supported attribute type in Three.JS, including:
   *     'position',
   *     'color',
   *     'normal',
   *     'uv',
   *     'uv2',
   *     'skinIndex',
   *     'skinWeight'.
   * The format is:
   *     attributeUniqueIdMap[attributeName] = attributeId
   */
  decodeDracoFile(rawBuffer, callback, attributeUniqueIdMap, attributeTypeMap) {
    const scope = this;
    THREE.DRACOLoader.getDecoderModule().then((module) => {
      scope.decodeDracoFileInternal(
        rawBuffer,
        module.decoder,
        callback,
        attributeUniqueIdMap || {},
        attributeTypeMap || {},
      );
    });
  },

  decodeDracoFileInternal(
    rawBuffer,
    dracoDecoder,
    callback,
    attributeUniqueIdMap,
    attributeTypeMap,
  ) {
    /*
       * Here is how to use Draco Javascript decoder and get the geometry.
       */
    const buffer = new dracoDecoder.DecoderBuffer();
    buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
    const decoder = new dracoDecoder.Decoder();

    /*
       * Determine what type is this file: mesh or point cloud.
       */
    const geometryType = decoder.GetEncodedGeometryType(buffer);
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      if (this.verbosity > 0) {
        console.log('Loaded a mesh.');
      }
    } else if (geometryType == dracoDecoder.POINT_CLOUD) {
      if (this.verbosity > 0) {
        console.log('Loaded a point cloud.');
      }
    } else {
      const errorMsg = 'THREE.DRACOLoader: Unknown geometry type.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    callback(
      this.convertDracoGeometryTo3JS(
        dracoDecoder,
        decoder,
        geometryType,
        buffer,
        attributeUniqueIdMap,
        attributeTypeMap,
      ),
    );
  },

  addAttributeToGeometry(
    dracoDecoder,
    decoder,
    dracoGeometry,
    attributeName,
    attributeType,
    attribute,
    geometry,
    geometryBuffer,
  ) {
    if (attribute.ptr === 0) {
      var errorMsg = `THREE.DRACOLoader: No attribute ${attributeName}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const numComponents = attribute.num_components();
    const numPoints = dracoGeometry.num_points();
    const numValues = numPoints * numComponents;
    let attributeData;
    let TypedBufferAttribute;

    switch (attributeType) {
      case Float32Array:
        attributeData = new dracoDecoder.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Float32Array(numValues);
        TypedBufferAttribute = THREE.Float32BufferAttribute;
        break;

      case Int8Array:
        attributeData = new dracoDecoder.DracoInt8Array();
        decoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Int8Array(numValues);
        TypedBufferAttribute = THREE.Int8BufferAttribute;
        break;

      case Int16Array:
        attributeData = new dracoDecoder.DracoInt16Array();
        decoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Int16Array(numValues);
        TypedBufferAttribute = THREE.Int16BufferAttribute;
        break;

      case Int32Array:
        attributeData = new dracoDecoder.DracoInt32Array();
        decoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Int32Array(numValues);
        TypedBufferAttribute = THREE.Int32BufferAttribute;
        break;

      case Uint8Array:
        attributeData = new dracoDecoder.DracoUInt8Array();
        decoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Uint8Array(numValues);
        TypedBufferAttribute = THREE.Uint8BufferAttribute;
        break;

      case Uint16Array:
        attributeData = new dracoDecoder.DracoUInt16Array();
        decoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Uint16Array(numValues);
        TypedBufferAttribute = THREE.Uint16BufferAttribute;
        break;

      case Uint32Array:
        attributeData = new dracoDecoder.DracoUInt32Array();
        decoder.GetAttributeUInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new Uint32Array(numValues);
        TypedBufferAttribute = THREE.Uint32BufferAttribute;
        break;

      default:
        var errorMsg = 'THREE.DRACOLoader: Unexpected attribute type.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    // Copy data from decoder.
    for (let i = 0; i < numValues; i++) {
      geometryBuffer[attributeName][i] = attributeData.GetValue(i);
    }
    // Add attribute to THREEJS geometry for rendering.
    geometry.addAttribute(
      attributeName,
      new TypedBufferAttribute(geometryBuffer[attributeName], numComponents),
    );
    dracoDecoder.destroy(attributeData);
  },

  convertDracoGeometryTo3JS(
    dracoDecoder,
    decoder,
    geometryType,
    buffer,
    attributeUniqueIdMap,
    attributeTypeMap,
  ) {
    if (this.getAttributeOptions('position').skipDequantization === true) {
      decoder.SkipAttributeTransform(dracoDecoder.POSITION);
    }
    let dracoGeometry;
    let decodingStatus;
    const start_time = performance.now();
    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      dracoGeometry = new dracoDecoder.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(buffer, dracoGeometry);
    } else {
      dracoGeometry = new dracoDecoder.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(buffer, dracoGeometry);
    }
    if (!decodingStatus.ok() || dracoGeometry.ptr == 0) {
      var errorMsg = 'THREE.DRACOLoader: Decoding failed: ';
      errorMsg += decodingStatus.error_msg();
      console.error(errorMsg);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMsg);
    }

    const decode_end = performance.now();
    dracoDecoder.destroy(buffer);
    /*
         * Example on how to retrieve mesh and attributes.
         */
    let numFaces;
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      numFaces = dracoGeometry.num_faces();
      if (this.verbosity > 0) {
        console.log(`Number of faces loaded: ${numFaces.toString()}`);
      }
    } else {
      numFaces = 0;
    }

    const numPoints = dracoGeometry.num_points();
    const numAttributes = dracoGeometry.num_attributes();
    if (this.verbosity > 0) {
      console.log(`Number of points loaded: ${numPoints.toString()}`);
      console.log(`Number of attributes loaded: ${numAttributes.toString()}`);
    }

    // Verify if there is position attribute.
    const posAttId = decoder.GetAttributeId(dracoGeometry, dracoDecoder.POSITION);
    if (posAttId == -1) {
      var errorMsg = 'THREE.DRACOLoader: No position attribute found.';
      console.error(errorMsg);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMsg);
    }
    const posAttribute = decoder.GetAttribute(dracoGeometry, posAttId);

    // Structure for converting to THREEJS geometry later.
    const geometryBuffer = {};
    // Import data to Three JS geometry.
    const geometry = new THREE.BufferGeometry();

    // Add native Draco attribute type to geometry.
    for (var attributeName in this.nativeAttributeMap) {
      // The native attribute type is only used when no unique Id is
      // provided. For example, loading .drc files.
      if (attributeUniqueIdMap[attributeName] === undefined) {
        const attId = decoder.GetAttributeId(
          dracoGeometry,
          dracoDecoder[this.nativeAttributeMap[attributeName]],
        );
        if (attId !== -1) {
          if (this.verbosity > 0) {
            console.log(`Loaded ${attributeName} attribute.`);
          }
          var attribute = decoder.GetAttribute(dracoGeometry, attId);
          this.addAttributeToGeometry(
            dracoDecoder,
            decoder,
            dracoGeometry,
            attributeName,
            Float32Array,
            attribute,
            geometry,
            geometryBuffer,
          );
        }
      }
    }

    // Add attributes of user specified unique id. E.g. GLTF models.
    for (var attributeName in attributeUniqueIdMap) {
      const attributeType = attributeTypeMap[attributeName] || Float32Array;
      const attributeId = attributeUniqueIdMap[attributeName];
      var attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeId);
      this.addAttributeToGeometry(
        dracoDecoder,
        decoder,
        dracoGeometry,
        attributeName,
        attributeType,
        attribute,
        geometry,
        geometryBuffer,
      );
    }

    // For mesh, we need to generate the faces.
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      if (this.drawMode === THREE.TriangleStripDrawMode) {
        const stripsArray = new dracoDecoder.DracoInt32Array();
        const numStrips = decoder.GetTriangleStripsFromMesh(dracoGeometry, stripsArray);
        geometryBuffer.indices = new Uint32Array(stripsArray.size());
        for (var i = 0; i < stripsArray.size(); ++i) {
          geometryBuffer.indices[i] = stripsArray.GetValue(i);
        }
        dracoDecoder.destroy(stripsArray);
      } else {
        const numIndices = numFaces * 3;
        geometryBuffer.indices = new Uint32Array(numIndices);
        const ia = new dracoDecoder.DracoInt32Array();
        for (var i = 0; i < numFaces; ++i) {
          decoder.GetFaceFromMesh(dracoGeometry, i, ia);
          const index = i * 3;
          geometryBuffer.indices[index] = ia.GetValue(0);
          geometryBuffer.indices[index + 1] = ia.GetValue(1);
          geometryBuffer.indices[index + 2] = ia.GetValue(2);
        }
        dracoDecoder.destroy(ia);
      }
    }

    geometry.drawMode = this.drawMode;
    if (geometryType == dracoDecoder.TRIANGULAR_MESH) {
      geometry.setIndex(
        new (geometryBuffer.indices.length > 65535
          ? THREE.Uint32BufferAttribute
          : THREE.Uint16BufferAttribute)(geometryBuffer.indices, 1),
      );
    }
    const posTransform = new dracoDecoder.AttributeQuantizationTransform();
    if (posTransform.InitFromAttribute(posAttribute)) {
      // Quantized attribute. Store the quantization parameters into the
      // THREE.js attribute.
      geometry.attributes.position.isQuantized = true;
      geometry.attributes.position.maxRange = posTransform.range();
      geometry.attributes.position.numQuantizationBits = posTransform.quantization_bits();
      geometry.attributes.position.minValues = new Float32Array(3);
      for (var i = 0; i < 3; ++i) {
        geometry.attributes.position.minValues[i] = posTransform.min_value(i);
      }
    }
    dracoDecoder.destroy(posTransform);
    dracoDecoder.destroy(decoder);
    dracoDecoder.destroy(dracoGeometry);

    this.decode_time = decode_end - start_time;
    this.import_time = performance.now() - decode_end;

    if (this.verbosity > 0) {
      console.log(`Decode time: ${this.decode_time}`);
      console.log(`Import time: ${this.import_time}`);
    }
    return geometry;
  },

  isVersionSupported(version, callback) {
    THREE.DRACOLoader.getDecoderModule().then((module) => {
      callback(module.decoder.isVersionSupported(version));
    });
  },

  getAttributeOptions(attributeName) {
    if (typeof this.attributeOptions[attributeName] === 'undefined') {
      this.attributeOptions[attributeName] = {};
    }
    return this.attributeOptions[attributeName];
  },
};

THREE.DRACOLoader.decoderPath = './';
THREE.DRACOLoader.decoderConfig = {};
THREE.DRACOLoader.decoderModulePromise = null;

/**
 * Sets the base path for decoder source files.
 * @param {string} path
 */
THREE.DRACOLoader.setDecoderPath = function (path) {
  THREE.DRACOLoader.decoderPath = path;
};

/**
 * Sets decoder configuration and releases singleton decoder module. Module
 * will be recreated with the next decoding call.
 * @param {Object} config
 */
THREE.DRACOLoader.setDecoderConfig = function (config) {
  const wasmBinary = THREE.DRACOLoader.decoderConfig.wasmBinary;
  THREE.DRACOLoader.decoderConfig = config || {};
  THREE.DRACOLoader.releaseDecoderModule();

  // Reuse WASM binary.
  if (wasmBinary) THREE.DRACOLoader.decoderConfig.wasmBinary = wasmBinary;
};

/**
 * Releases the singleton DracoDecoderModule instance. Module will be recreated
 * with the next decoding call.
 */
THREE.DRACOLoader.releaseDecoderModule = function () {
  THREE.DRACOLoader.decoderModulePromise = null;
};

/**
 * Gets WebAssembly or asm.js singleton instance of DracoDecoderModule
 * after testing for browser support. Returns Promise that resolves when
 * module is available.
 * @return {Promise<{decoder: DracoDecoderModule}>}
 */
THREE.DRACOLoader.getDecoderModule = function () {
  const scope = this;
  const path = THREE.DRACOLoader.decoderPath;
  const config = THREE.DRACOLoader.decoderConfig;
  let promise = THREE.DRACOLoader.decoderModulePromise;

  if (promise) return promise;

  // Load source files.
  if (typeof DracoDecoderModule !== 'undefined') {
    // Loaded externally.
    promise = Promise.resolve();
  } else if (typeof WebAssembly !== 'object' || config.type === 'js') {
    // Load with asm.js.
    promise = THREE.DRACOLoader._loadScript(`${path}draco_decoder.js`);
  } else {
    // Load with WebAssembly.
    config.wasmBinaryFile = `${path}draco_decoder.wasm`;
    promise = THREE.DRACOLoader._loadScript(`${path}draco_wasm_wrapper.js`)
      .then(() => THREE.DRACOLoader._loadArrayBuffer(config.wasmBinaryFile))
      .then((wasmBinary) => {
        config.wasmBinary = wasmBinary;
      });
  }

  // Wait for source files, then create and return a decoder.
  promise = promise.then(
    () => new Promise((resolve) => {
        config.onModuleLoaded = function (decoder) {
          scope.timeLoaded = performance.now();
          // Module is Promise-like. Wrap before resolving to avoid loop.
          resolve({ decoder });
        };
        DracoDecoderModule(config);
      }),
  );

  THREE.DRACOLoader.decoderModulePromise = promise;
  return promise;
};

/**
 * @param {string} src
 * @return {Promise}
 */
THREE.DRACOLoader._loadScript = function (src) {
  const prevScript = document.getElementById('decoder_script');
  if (prevScript !== null) {
    prevScript.parentNode.removeChild(prevScript);
  }
  const head = document.getElementsByTagName('head')[0];
  const script = document.createElement('script');
  script.id = 'decoder_script';
  script.type = 'text/javascript';
  script.src = src;
  return new Promise((resolve) => {
    script.onload = resolve;
    head.appendChild(script);
  });
};

/**
 * @param {string} src
 * @return {Promise}
 */
THREE.DRACOLoader._loadArrayBuffer = function (src) {
  const loader = new THREE.FileLoader();
  loader.setResponseType('arraybuffer');
  return new Promise((resolve, reject) => {
    loader.load(src, resolve, undefined, reject);
  });
};
