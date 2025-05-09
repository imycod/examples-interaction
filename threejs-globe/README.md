# threejs-globe

This is inspired by Github & Stripes webgl globes.

The dots clustered together resembling continents are achieved by reading an image of the world.
Getting the image data for each pixel and iterating over each pixel.
If the pixels r,g,b values exceed 100, display dot.
The position of the dot is worked out by determining the lat and long position of the pixel.

Each dot within the canvas independently changes colour to give off a twinkling effect.
This is achieved by shaders. 

If the globe is clicked and dragged, the globe rotates in the direction of the drag.
Along with this functionality, each dot independently extrudes off the globe creating a scattered effect.
This is achieved by shaders.

To view, checkout: <a href="https://hydeit.co/globe/" target="_blank">https://hydeit.co/globe/</a>

![alt text](https://github.com/jessehhydee/threejs-globe/blob/main/img/app_screen_shot.png?raw=true)



# 参考和引用
reddit ripple wave effect
https://www.reddit.com/r/threejs/comments/oydqs6/working_on_a_globe_for_a_client_like_the_one_on/
https://github.com/FarazzShaikh/experiments

## To design and develop an interactive globe
https://stripe.com/blog/globe

How we built the GitHub globe
https://github.blog/engineering/how-we-built-the-github-globe/

