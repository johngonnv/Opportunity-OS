import React, { useRef, useEffect } from "react";
import { ScrollView, ScrollViewProps, Platform } from "react-native";

interface WebScrollNode {
  getScrollableNode(): HTMLElement | null;
}

function hasGetScrollableNode(ref: unknown): ref is WebScrollNode {
  return typeof (ref as WebScrollNode)?.getScrollableNode === "function";
}

type Props = ScrollViewProps & { children?: React.ReactNode };

export function DraggableScrollView({ ...props }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!hasGetScrollableNode(scrollRef.current)) return;

    const node = scrollRef.current.getScrollableNode();
    if (!node) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      hasDragged = false;
      startX = e.pageX - node.offsetLeft;
      scrollLeft = node.scrollLeft;
      node.style.cursor = "grabbing";
    };

    const stopDrag = () => {
      isDown = false;
      hasDragged = false;
      node.style.cursor = "grab";
      node.style.userSelect = "";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - node.offsetLeft;
      const walk = x - startX;
      if (!hasDragged && Math.abs(walk) < 5) return;
      hasDragged = true;
      e.preventDefault();
      node.style.userSelect = "none";
      node.scrollLeft = scrollLeft - walk;
    };

    node.style.cursor = "grab";
    node.addEventListener("mousedown", onMouseDown);
    node.addEventListener("mouseleave", stopDrag);
    node.addEventListener("mouseup", stopDrag);
    node.addEventListener("mousemove", onMouseMove);

    return () => {
      node.removeEventListener("mousedown", onMouseDown);
      node.removeEventListener("mouseleave", stopDrag);
      node.removeEventListener("mouseup", stopDrag);
      node.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return <ScrollView ref={scrollRef} {...props} />;
}
