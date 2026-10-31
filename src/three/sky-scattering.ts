/**
 * Analytic daylight sky shared by the visible dome and the image-based lighting.
 * A cheap Rayleigh/Mie approximation: deep zenith, bright horizon, warm forward
 * scattering around the sun and a dark blue night.
 */
export const SKY_SCATTERING_GLSL = /* glsl */ `
  vec3 kgSkyScattering(vec3 direction, vec3 sunDirection, float daylight, float cloudiness) {
    float altitude = clamp(direction.y, -1.0, 1.0);
    float horizon = 1.0 - pow(max(0.0, altitude), 0.42);
    float below = smoothstep(0.0, -0.25, altitude);
    vec3 zenithDay = vec3(0.19, 0.39, 0.74);
    vec3 horizonDay = vec3(0.70, 0.80, 0.88);
    vec3 day = mix(zenithDay, horizonDay, horizon);
    day = mix(day, vec3(0.46, 0.50, 0.48), below * 0.7);
    float sunHeight = sunDirection.y;
    float cosSun = max(0.0, dot(direction, sunDirection));
    float sunset = (1.0 - smoothstep(0.0, 0.35, sunHeight)) * smoothstep(-0.18, 0.02, sunHeight);
    vec3 warm = vec3(1.0, 0.52, 0.24);
    day = mix(day, mix(day, warm, horizon * horizon), sunset * (0.55 + 0.45 * pow(cosSun, 2.0)));
    // Mie forward scattering: a soft bright halo that grows in haze.
    float mie = pow(cosSun, 12.0) * (0.28 + cloudiness * 0.25) + pow(cosSun, 90.0) * 0.6;
    day += vec3(1.0, 0.86, 0.62) * mie * smoothstep(-0.1, 0.1, sunHeight);
    vec3 overcast = vec3(0.62, 0.66, 0.69) * (0.75 + 0.25 * horizon);
    day = mix(day, overcast, cloudiness * 0.72);
    vec3 night = mix(vec3(0.012, 0.025, 0.06), vec3(0.04, 0.07, 0.13), horizon);
    float light = smoothstep(-0.02, 0.35, daylight);
    // Colours above are authored in display (sRGB) space; shading happens in linear light.
    return pow(max(mix(night, day, light), vec3(0.0)), vec3(2.2));
  }
`;
