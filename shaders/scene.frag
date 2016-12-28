//Distance field functions found here : http://www.iquilezles.org/www/articles/distfunctions/distfunctions.html
precision mediump float;

uniform float uGlobalTime;
uniform float uCosGlobalTime;
uniform float uSinGlobalTime;
uniform vec2 uResolution;

uniform vec3 uCamPosition;
uniform vec3 uCamDir;
uniform vec3 uCamUp;

varying vec2 uv;
#define FieldOfView 1.0
#define MaxSteps 100
#define MinimumDistance 0.001
#define NormalDistance 1.3
#define ColorInterpolateStep 0.4
#define Jitter 1.0

#define Ambient 0.28452
#define Diffuse 0.57378
#define Specular 0.07272
#define LightDir vec3(1.0,1.0,-0.65048)
#define LightColor vec3(1.0,0.666667,0.0)
#define LightDir2 vec3(1.0,-0.62886,1.0)
#define LightColor2 vec3(0.596078,0.635294,1.0)

//-----------------Main functions--------------------


// Two light source + env light
vec3 getLight(in vec3 color, in vec3 normal, in vec3 dir) {
	vec3 lightDir = normalize(LightDir);
	float specular = pow(max(0.0,dot(lightDir,-reflect(lightDir, normal))),20.0); // Phong
	float diffuse = max(0.0,dot(-normal, lightDir)); // Lambertian
	vec3 lightDir2 = normalize(LightDir2);
	float specular2 = pow(max(0.0,dot(lightDir2,-reflect(lightDir2, normal))),20.0); // Phong
	float diffuse2 = max(0.0,dot(-normal, lightDir2)); // Lambertian
	
	return
		vec3(255.0,255.0,255.0)*Specular+
		(Specular*specular)*LightColor+(diffuse*Diffuse)*(LightColor*color) +
		(Specular*specular2)*LightColor2+(diffuse2*Diffuse)*(LightColor2*color);
}


float sdSphere(in vec3 p, in float s )
{
	return length(p)-s;
}
float displacement(in vec3 p ){
	float n = uCosGlobalTime * 4.0;
	return sin(n*p.x)*sin(n*p.y)*sin(n*p.z);
}
float opDisplaceSphere( in vec3 p )
{
    float d1 = sdSphere(p, 2.0);
    float d2 = displacement(p);
    return d1+d2;
}

float rTorus( in vec3 p, in vec2 t )
{
	vec2 q = vec2(length(p.xz)-t.x,p.y);
	return length(q)-t.y;
}
float opTwistyTaurus( in vec3 p )
{
	float n = uSinGlobalTime;
    float c = cos(1.1*p.y*n);
    float s = sin(1.1*p.y*n);
    mat2 m = mat2(c,-s,s,c);
    vec3 q = vec3(m*p.xz,p.y);
    return rTorus(q, vec2(2.5 * n, 1.0));
}


//Blends two primitives together
float smin( in float a, in float b, in float k )
{
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}
float opBlend( in vec3 p )
{
    float d1 = opDisplaceSphere(p);
    float d2 = opTwistyTaurus(p);
    return smin( d1, d2, 0.1 );
}

//repeats
float opRep( in vec3 p, in vec3 c )
{
    vec3 q = mod(p,c)-0.5*c;
    return opBlend( q );
}
// Filmic tone mapping:
// http://filmicgames.com/archives/75
vec3 toneMap(in vec3 c) {
	c = pow(c,vec3(2.0));
	vec3 x = max(vec3(0.0),c-vec3(0.004));
	c = (x*(6.2*x+.5))/(x*(6.2*x+1.7)+0.06);
	return c;
}

// Solid color with a little bit of normal :-)
vec3 getColor(vec3 normal) {
	return mix(vec3(1.0),abs(normal),ColorInterpolateStep); 
}

// Finite difference normal
vec3 getNormal(in vec3 pos) {
	vec3 e = vec3(0.0,NormalDistance,0.0);
	
	return normalize(vec3(
			opRep(pos+e.yxx, vec3(10.0,10.0,10.0))-opRep(pos-e.yxx, vec3(10.0,10.0,10.0)),
			opRep(pos+e.xyx, vec3(10.0,10.0,10.0))-opRep(pos-e.xyx, vec3(10.0,10.0,10.0)),
			opRep(pos+e.xxy, vec3(10.0,10.0,10.0))-opRep(pos-e.xxy, vec3(10.0,10.0,10.0))));
}

// Pseudo-random number
// From: lumina.sourceforge.net/Tutorials/Noise.html
float rand(vec2 co){
	return fract(cos(dot(co,vec2(4.898,7.23))) * 23421.631);
}

//Main tracing function that maps the distances of each pixel
vec4 rayMarch(in vec3 from, in vec3 dir, in vec2 pix)
{
	float t = Jitter*rand(pix+vec2(uGlobalTime));
	float d = 0.0;
	int steps = 0;
	vec3 pos; 
	//Loop through (in this case 32 times)
	for(int i = 0; i < MaxSteps; ++i)
	{
		//Get the point along the ray
		pos = from + dir * t;
		//Get the value for the distance field
		d = opRep(pos, vec3(10.0,10.0,10.0));
		if (d < MinimumDistance){ break; }
		t += d * 0.5;
		steps = i;
	}

	// 'AO' is based on number of steps.
	// Try to smooth the count, to combat banding.
	float smoothStep = float(steps) + float(d/MinimumDistance);
	float temp = (smoothStep/float(MaxSteps));
	float ao = 1.0 - clamp(temp, 0.0, 1.0);
	

	// Since our distance field is not signed,
	// backstep when calc'ing normal
	vec3 normal = getNormal(pos-dir*NormalDistance*3.0);
	vec3 color = getColor(normal);
	vec3 light = getLight(color, normal, dir);

	return vec4(toneMap((color*Ambient)*ao),1.0);
}

void main()
{
	vec2 coord = uv;
	coord.x *= uResolution.x / uResolution.y;

	// Camera position (eye), and camera target
	vec3 camPos = vec3(uCamPosition.x,uCamPosition.y,uCamPosition.z);
	vec3 target = camPos+vec3(uCamDir.x,uCamDir.y,uCamDir.z);
	vec3 camUp  = vec3(uCamUp.x,uCamUp.y,uCamUp.z);
	
	// Calculate orthonormal camera reference system
	vec3 camDir   = normalize(target-camPos); // direction for center ray
	camUp = normalize(camUp-dot(camDir,camUp)*camDir); // orthogonalize
	vec3 camRight = normalize(cross(camDir,camUp));
	
	// Get direction for this pixel
	vec3 rayDir = normalize(camDir + (coord.x*camRight + coord.y*camUp)*FieldOfView);

	gl_FragColor = rayMarch(camPos,rayDir,gl_FragCoord.xy);
}
